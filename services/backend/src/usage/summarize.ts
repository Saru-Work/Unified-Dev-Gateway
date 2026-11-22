import { truncate, type BucketUnit, type UsageRollupRow } from "./UsageRepository";

export const USAGE_RANGES = {
  "24h": { hours: 24, unit: "hour" },
  "7d": { hours: 7 * 24, unit: "day" },
  "30d": { hours: 30 * 24, unit: "day" },
} as const satisfies Record<string, { hours: number; unit: BucketUnit }>;

export type UsageRange = keyof typeof USAGE_RANGES;

export interface UsageSummary {
  enabled: true;
  range: UsageRange;
  unit: BucketUnit;
  from: string;
  to: string;
  totals: {
    calls: number;
    /** 4xx and 5xx responses. */
    errors: number;
    /** 429s: a tier, application or shared limit was reached. */
    throttled: number;
    errorRate: number;
    avgLatencyMs?: number;
    p95LatencyMs?: number;
  };
  /** One entry per hour or day in the range, oldest first, including empty ones. */
  series: { start: string; calls: number; errors: number }[];
  /** Busiest first. */
  apis: { apiId: string; apiName: string; calls: number; errors: number; avgLatencyMs?: number }[];
  /** Most frequent first. */
  statuses: { status: number; calls: number }[];
  lastCallAt?: string;
}

/** Where a range starts and ends, with "to" at the end of the current bucket. */
export function rangeWindow(range: UsageRange, now: Date): { from: Date; to: Date; unit: BucketUnit } {
  const { hours, unit } = USAGE_RANGES[range];
  const step = unit === "hour" ? 3_600_000 : 86_400_000;
  const to = new Date(truncate(now, unit).getTime() + step);
  const from = new Date(to.getTime() - hours * 3_600_000);
  return { from, to, unit };
}

const round = (n: number) => Math.round(n);

export function summarize(
  rows: UsageRollupRow[],
  options: { range: UsageRange; from: Date; to: Date; unit: BucketUnit; p95?: number; lastCallAt?: Date },
): UsageSummary {
  const { range, from, to, unit } = options;
  const step = unit === "hour" ? 3_600_000 : 86_400_000;
  const isError = (status: number) => status >= 400;

  const series = new Map<number, { calls: number; errors: number }>();
  for (let t = from.getTime(); t < to.getTime(); t += step) series.set(t, { calls: 0, errors: 0 });

  const apis = new Map<string, { apiName: string; calls: number; errors: number; latencySum: number; latencyCount: number }>();
  const statuses = new Map<number, number>();
  let calls = 0;
  let errors = 0;
  let throttled = 0;
  let latencySum = 0;
  let latencyCount = 0;

  for (const row of rows) {
    const errs = isError(row.status) ? row.calls : 0;
    calls += row.calls;
    errors += errs;
    if (row.status === 429) throttled += row.calls;
    latencySum += row.latencySum;
    latencyCount += row.latencyCount;

    const bucket = series.get(truncate(row.bucket, unit).getTime());
    if (bucket) {
      bucket.calls += row.calls;
      bucket.errors += errs;
    }
    const api = apis.get(row.apiId) ?? { apiName: row.apiName, calls: 0, errors: 0, latencySum: 0, latencyCount: 0 };
    api.calls += row.calls;
    api.errors += errs;
    api.latencySum += row.latencySum;
    api.latencyCount += row.latencyCount;
    apis.set(row.apiId, api);
    statuses.set(row.status, (statuses.get(row.status) ?? 0) + row.calls);
  }

  return {
    enabled: true,
    range,
    unit,
    from: from.toISOString(),
    to: to.toISOString(),
    totals: {
      calls,
      errors,
      throttled,
      errorRate: calls ? errors / calls : 0,
      ...(latencyCount > 0 && { avgLatencyMs: round(latencySum / latencyCount) }),
      ...(options.p95 !== undefined && { p95LatencyMs: round(options.p95) }),
    },
    series: [...series].map(([t, v]) => ({ start: new Date(t).toISOString(), ...v })),
    apis: [...apis]
      .map(([apiId, a]) => ({
        apiId,
        apiName: a.apiName,
        calls: a.calls,
        errors: a.errors,
        ...(a.latencyCount > 0 && { avgLatencyMs: round(a.latencySum / a.latencyCount) }),
      }))
      .sort((a, b) => b.calls - a.calls || a.apiName.localeCompare(b.apiName)),
    statuses: [...statuses]
      .map(([status, n]) => ({ status, calls: n }))
      .sort((a, b) => b.calls - a.calls || a.status - b.status),
    ...(options.lastCallAt && { lastCallAt: options.lastCallAt.toISOString() }),
  };
}
