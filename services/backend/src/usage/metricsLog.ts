/**
 * Parses the analytics events WSO2's gateway writes to apim_metrics.log when
 * analytics type "elk" is on (see wso2-config/wso2-start.sh). One line per
 * API call, e.g.
 *   20:51:15,229 [...] INFO ELKCounterMetric apimMetrics: apim:response, properties :{"apiName":...}
 * "apim:faulty" lines are failed calls (auth errors, throttling, backend errors).
 */

export interface UsageEvent {
  /** Unique per call; used to ignore events read twice. */
  correlationId: string;
  timestamp: Date;
  /** WSO2's application UUID, i.e. ApplicationRecord.wso2ApplicationId. */
  wso2ApplicationId: string;
  apiId: string;
  apiName: string;
  apiVersion?: string;
  /** The matched resource, e.g. "/pokemon/{name}". */
  resource?: string;
  method?: string;
  /** The status the developer got. */
  status: number;
  /** Total time at the gateway, in milliseconds. */
  latencyMs?: number;
  /** For failed calls, e.g. "THROTTLED", "AUTH", "TARGET_CONNECTIVITY". */
  errorType?: string;
}

const LINE = /apimMetrics: apim:(response|faulty), properties :(\{.*\})\s*$/;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value && value !== "UNKNOWN" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * The usage event on a log line, or null for anything else: other log lines,
 * malformed JSON, and calls that can't be tied to an application (e.g. ones
 * rejected for a missing token).
 */
export function parseMetricLine(line: string): UsageEvent | null {
  const match = LINE.exec(line);
  if (!match) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match[2]) as Record<string, unknown>;
  } catch {
    return null;
  }

  const correlationId = str(data.correlationId);
  const wso2ApplicationId = str(data.applicationId);
  const apiId = str(data.apiId);
  const timestamp = new Date(String(data.requestTimestamp));
  const status = num(data.proxyResponseCode);
  if (!correlationId || !wso2ApplicationId || !apiId || status === undefined) return null;
  if (Number.isNaN(timestamp.getTime())) return null;

  const event: UsageEvent = {
    correlationId,
    timestamp,
    wso2ApplicationId,
    apiId,
    apiName: str(data.apiName) ?? apiId,
    status,
  };
  const optional = {
    apiVersion: str(data.apiVersion),
    resource: str(data.apiResourceTemplate),
    method: str(data.apiMethod),
    latencyMs: num(data.responseLatency),
    errorType: match[1] === "faulty" ? str(data.errorType) : undefined,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (event as unknown as Record<string, unknown>)[key] = value;
  }
  return event;
}
