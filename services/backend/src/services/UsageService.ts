import type { ApplicationRecord } from "../repositories/ApplicationRepository";
import { AppError } from "../errors/AppError";
import { toCsv } from "../usage/csv";
import type { IUsageRepository } from "../usage/UsageRepository";
import {
  rangeWindow,
  summarize,
  USAGE_RANGES,
  type UsageRange,
  type UsageSummary,
} from "../usage/summarize";

export interface ApplicationCalls {
  applicationId: string;
  name: string;
  calls: number;
  errors: number;
}

/** A usage summary plus how it splits across applications, busiest first. */
export type AccountUsage = UsageSummary & { applications: ApplicationCalls[] };

/** Reads a `range` query parameter; the last 24 hours by default. */
export function readRange(value: unknown): UsageRange {
  if (value === undefined) return "24h";
  if (typeof value !== "string" || !Object.hasOwn(USAGE_RANGES, value)) {
    throw new AppError(400, `range must be one of ${Object.keys(USAGE_RANGES).join(", ")}`);
  }
  return value as UsageRange;
}

/** Summarises gateway calls. Callers pass only applications the user owns. */
export class UsageService {
  constructor(private readonly usage: IUsageRepository) {}

  async summary(
    applications: ApplicationRecord[],
    range: UsageRange,
    now = new Date(),
  ): Promise<UsageSummary> {
    const wso2ApplicationIds = applications.map((a) => a.wso2ApplicationId);
    const { from, to, unit } = rangeWindow(range, now);
    const query = { wso2ApplicationIds, from, to };
    const [rows, p95, lastCallAt] = await Promise.all([
      this.usage.rollup({ ...query, unit }),
      this.usage.latencyP95(query),
      this.usage.lastCallAt(wso2ApplicationIds),
    ]);
    return summarize(rows, { range, from, to, unit, p95, lastCallAt });
  }

  async account(applications: ApplicationRecord[], range: UsageRange): Promise<AccountUsage> {
    const now = new Date();
    const { from, to } = rangeWindow(range, now);
    const [summary, rows] = await Promise.all([
      this.summary(applications, range, now),
      this.usage.callsByApplication({
        wso2ApplicationIds: applications.map((a) => a.wso2ApplicationId),
        from,
        to,
      }),
    ]);
    const byId = new Map(applications.map((a) => [a.wso2ApplicationId, a]));
    return {
      ...summary,
      applications: rows
        .flatMap(({ wso2ApplicationId, calls, errors }) => {
          const app = byId.get(wso2ApplicationId);
          return app ? [{ applicationId: app.id, name: app.name, calls, errors }] : [];
        })
        .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
    };
  }

  async csv(applications: ApplicationRecord[], range: UsageRange): Promise<string> {
    const names = new Map(applications.map((a) => [a.wso2ApplicationId, a.name]));
    const rows = await this.usage.details({
      wso2ApplicationIds: [...names.keys()],
      ...rangeWindow(range, new Date()),
    });
    return toCsv(rows, (id) => names.get(id) ?? id);
  }
}
