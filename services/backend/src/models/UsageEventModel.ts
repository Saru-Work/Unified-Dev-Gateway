import { Schema, model } from "mongoose";
import type { UsageEvent } from "../usage/metricsLog";

/** How long usage is kept. */
export const USAGE_RETENTION_DAYS = 30;

const usageEventSchema = new Schema<UsageEvent>(
  {
    correlationId: { type: String, required: true, unique: true },
    timestamp: { type: Date, required: true },
    wso2ApplicationId: { type: String, required: true },
    apiId: { type: String, required: true },
    apiName: { type: String, required: true },
    apiVersion: String,
    resource: String,
    method: String,
    status: { type: Number, required: true },
    latencyMs: Number,
    errorType: String,
  },
  { versionKey: false },
);
usageEventSchema.index({ wso2ApplicationId: 1, timestamp: 1 });
// MongoDB deletes events once they're older than the retention period.
usageEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: USAGE_RETENTION_DAYS * 86_400 });

export const usageEventModel = model<UsageEvent>("UsageEvent", usageEventSchema);

/** Where the collector has read up to in a log file. */
interface UsageCursorDocument {
  _id: string;
  ino: string;
  offset: number;
}

export const usageCursorModel = model<UsageCursorDocument>(
  "UsageCursor",
  new Schema<UsageCursorDocument>({ _id: String, ino: String, offset: Number }, { versionKey: false }),
);
