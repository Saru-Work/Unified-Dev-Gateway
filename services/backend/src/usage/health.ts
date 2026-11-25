import type { IUsageRepository } from "./UsageRepository";

export const HEALTH_WINDOW_HOURS = 6;
/** With fewer calls than this, one bad response would swing the verdict. */
const MIN_CALLS = 5;
const DEGRADED_RATE = 0.05;
const DOWN_RATE = 0.5;

export type HealthStatus = "operational" | "degraded" | "down" | "unknown";

/** Calls to one API in the health window, across all applications. */
export interface ApiHealthRow {
  apiId: string;
  calls: number;
  /** 5xx responses: the API's fault, unlike a caller's 4xx or 429. */
  serverErrors: number;
  /** Mean latency of the calls that were timed. */
  avgLatencyMs?: number;
}

export interface ApiHealth {
  apiId: string;
  status: HealthStatus;
  /** Share of calls that weren't 5xx; absent when there are too few to judge. */
  successRate?: number;
  avgLatencyMs?: number;
}

/**
 * Judges an API by its real traffic. The call counts stay internal: this is
 * shown to everyone, and with few callers they'd reveal one developer's usage.
 */
export function toHealth(row: ApiHealthRow): ApiHealth {
  if (row.calls < MIN_CALLS) return { apiId: row.apiId, status: "unknown" };
  const errorRate = row.serverErrors / row.calls;
  const status = errorRate >= DOWN_RATE ? "down" : errorRate >= DEGRADED_RATE ? "degraded" : "operational";
  return {
    apiId: row.apiId,
    status,
    successRate: Math.round((1 - errorRate) * 1000) / 1000,
    ...(row.avgLatencyMs !== undefined && { avgLatencyMs: Math.round(row.avgLatencyMs) }),
  };
}

export async function apiHealth(usage: IUsageRepository, now: Date): Promise<ApiHealth[]> {
  const from = new Date(now.getTime() - HEALTH_WINDOW_HOURS * 3_600_000);
  return (await usage.healthByApi(from, now)).map(toHealth);
}
