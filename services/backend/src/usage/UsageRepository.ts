import type { PipelineStage } from "mongoose";
import { usageCursorModel, usageEventModel } from "../models/UsageEventModel";
import type { ApiHealthRow } from "./health";
import type { UsageEvent } from "./metricsLog";

export type BucketUnit = "hour" | "day";

/** Calls grouped by time bucket, API and status. */
export interface UsageRollupRow {
  bucket: Date;
  apiId: string;
  apiName: string;
  status: number;
  calls: number;
  latencySum: number;
  latencyCount: number;
}

export interface UsageQuery {
  /** The applications to count; none means no calls. */
  wso2ApplicationIds: string[];
  from: Date;
  to: Date;
  unit: BucketUnit;
}

/** Where the collector has read up to in a log file. */
export interface LogCursor {
  ino: string;
  offset: number;
}

/** A rollup row for one application. */
export interface UsageDetailRow extends UsageRollupRow {
  wso2ApplicationId: string;
}

export interface ApplicationCallsRow {
  wso2ApplicationId: string;
  calls: number;
  errors: number;
}

/** How widely an API is used. */
export interface ApiPopularityRow {
  apiId: string;
  /** Distinct applications that got at least one successful response. */
  applications: number;
}

export interface IUsageRepository {
  /** Stores events, silently skipping ones already stored. */
  insertMany(events: UsageEvent[]): Promise<void>;
  rollup(query: UsageQuery): Promise<UsageRollupRow[]>;
  /** Like rollup, split by application too; oldest first, then by application, API and status. */
  details(query: UsageQuery): Promise<UsageDetailRow[]>;
  /** The 95th percentile latency, or undefined if there are no timed calls. */
  latencyP95(query: Omit<UsageQuery, "unit">): Promise<number | undefined>;
  /** Calls and errors (4xx and 5xx) per application; ones without calls are left out. */
  callsByApplication(query: Omit<UsageQuery, "unit">): Promise<ApplicationCallsRow[]>;
  /** When the applications' most recent call happened, if ever. */
  lastCallAt(wso2ApplicationIds: string[]): Promise<Date | undefined>;
  /** Calls, server errors and latency per API, across all applications. */
  healthByApi(from: Date, to: Date): Promise<ApiHealthRow[]>;
  /** The most widely used APIs, most applications first (then most calls). */
  popularApis(from: Date, to: Date, limit: number): Promise<ApiPopularityRow[]>;
  getCursor(file: string): Promise<LogCursor | null>;
  saveCursor(file: string, cursor: LogCursor): Promise<void>;
}

/** Start of the hour or (UTC) day a date falls in. */
export function truncate(date: Date, unit: BucketUnit): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  if (unit === "day") d.setUTCHours(0);
  return d;
}

function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number; writeErrors?: { code?: number }[] };
  if (e.code === 11000 && !e.writeErrors) return true;
  return Array.isArray(e.writeErrors) && e.writeErrors.length > 0 && e.writeErrors.every((w) => w.code === 11000);
}

export class UsageRepository implements IUsageRepository {
  async insertMany(events: UsageEvent[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await usageEventModel.insertMany(events, { ordered: false });
    } catch (err) {
      // Re-reading a log after a restart yields events we already have.
      if (!isDuplicateKeyError(err)) throw err;
    }
  }

  async rollup({ wso2ApplicationIds, from, to, unit }: UsageQuery): Promise<UsageRollupRow[]> {
    const pipeline: PipelineStage[] = [
      { $match: { wso2ApplicationId: { $in: wso2ApplicationIds }, timestamp: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: {
            bucket: { $dateTrunc: { date: "$timestamp", unit, timezone: "UTC" } },
            apiId: "$apiId",
            status: "$status",
          },
          apiName: { $last: "$apiName" },
          calls: { $sum: 1 },
          latencySum: { $sum: { $ifNull: ["$latencyMs", 0] } },
          latencyCount: { $sum: { $cond: [{ $gt: ["$latencyMs", null] }, 1, 0] } },
        },
      },
    ];
    const rows = await usageEventModel.aggregate<{
      _id: { bucket: Date; apiId: string; status: number };
      apiName: string;
      calls: number;
      latencySum: number;
      latencyCount: number;
    }>(pipeline);
    return rows.map((r) => ({
      bucket: r._id.bucket,
      apiId: r._id.apiId,
      apiName: r.apiName,
      status: r._id.status,
      calls: r.calls,
      latencySum: r.latencySum,
      latencyCount: r.latencyCount,
    }));
  }

  async details({ wso2ApplicationIds, from, to, unit }: UsageQuery): Promise<UsageDetailRow[]> {
    const rows = await usageEventModel.aggregate<{
      _id: { bucket: Date; app: string; apiId: string; status: number };
      apiName: string;
      calls: number;
      latencySum: number;
      latencyCount: number;
    }>([
      { $match: { wso2ApplicationId: { $in: wso2ApplicationIds }, timestamp: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: {
            bucket: { $dateTrunc: { date: "$timestamp", unit, timezone: "UTC" } },
            app: "$wso2ApplicationId",
            apiId: "$apiId",
            status: "$status",
          },
          apiName: { $last: "$apiName" },
          calls: { $sum: 1 },
          latencySum: { $sum: { $ifNull: ["$latencyMs", 0] } },
          latencyCount: { $sum: { $cond: [{ $gt: ["$latencyMs", null] }, 1, 0] } },
        },
      },
      { $sort: { "_id.bucket": 1, "_id.app": 1, "_id.apiId": 1, "_id.status": 1 } },
    ]);
    return rows.map(({ _id, ...row }) => ({
      bucket: _id.bucket,
      wso2ApplicationId: _id.app,
      apiId: _id.apiId,
      status: _id.status,
      ...row,
    }));
  }

  async latencyP95({ wso2ApplicationIds, from, to }: Omit<UsageQuery, "unit">): Promise<number | undefined> {
    const [row] = await usageEventModel.aggregate<{ p: number[] }>([
      { $match: { wso2ApplicationId: { $in: wso2ApplicationIds }, timestamp: { $gte: from, $lt: to }, latencyMs: { $exists: true } } },
      { $group: { _id: null, p: { $percentile: { input: "$latencyMs", p: [0.95], method: "approximate" } } } },
    ]);
    return row?.p?.[0];
  }

  async callsByApplication({
    wso2ApplicationIds,
    from,
    to,
  }: Omit<UsageQuery, "unit">): Promise<ApplicationCallsRow[]> {
    const rows = await usageEventModel.aggregate<{ _id: string; calls: number; errors: number }>([
      { $match: { wso2ApplicationId: { $in: wso2ApplicationIds }, timestamp: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: "$wso2ApplicationId",
          calls: { $sum: 1 },
          errors: { $sum: { $cond: [{ $gte: ["$status", 400] }, 1, 0] } },
        },
      },
    ]);
    return rows.map((r) => ({ wso2ApplicationId: r._id, calls: r.calls, errors: r.errors }));
  }

  async lastCallAt(wso2ApplicationIds: string[]): Promise<Date | undefined> {
    const doc = await usageEventModel
      .findOne({ wso2ApplicationId: { $in: wso2ApplicationIds } }, { timestamp: 1 })
      .sort({ timestamp: -1 })
      .lean();
    return doc?.timestamp;
  }

  async healthByApi(from: Date, to: Date): Promise<ApiHealthRow[]> {
    const rows = await usageEventModel.aggregate<{
      _id: string;
      calls: number;
      serverErrors: number;
      avgLatencyMs: number | null;
    }>([
      { $match: { timestamp: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: "$apiId",
          calls: { $sum: 1 },
          serverErrors: { $sum: { $cond: [{ $gte: ["$status", 500] }, 1, 0] } },
          // $avg skips events without a latency, and is null if none has one.
          avgLatencyMs: { $avg: "$latencyMs" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({
      apiId: r._id,
      calls: r.calls,
      serverErrors: r.serverErrors,
      ...(r.avgLatencyMs !== null && { avgLatencyMs: r.avgLatencyMs }),
    }));
  }

  async popularApis(from: Date, to: Date, limit: number): Promise<ApiPopularityRow[]> {
    const rows = await usageEventModel.aggregate<{ _id: string; applications: number }>([
      { $match: { timestamp: { $gte: from, $lt: to }, status: { $lt: 400 } } },
      // Per application first, so counting them never builds a huge set.
      { $group: { _id: { apiId: "$apiId", app: "$wso2ApplicationId" }, calls: { $sum: 1 } } },
      { $group: { _id: "$_id.apiId", applications: { $sum: 1 }, calls: { $sum: "$calls" } } },
      { $sort: { applications: -1, calls: -1, _id: 1 } },
      { $limit: limit },
    ]);
    return rows.map((r) => ({ apiId: r._id, applications: r.applications }));
  }

  async getCursor(file: string): Promise<LogCursor | null> {
    const doc = await usageCursorModel.findById(file).lean();
    return doc ? { ino: doc.ino, offset: doc.offset } : null;
  }

  async saveCursor(file: string, cursor: LogCursor): Promise<void> {
    await usageCursorModel.updateOne({ _id: file }, { $set: cursor }, { upsert: true });
  }
}
