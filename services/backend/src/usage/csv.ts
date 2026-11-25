import type { UsageDetailRow } from "./UsageRepository";

/**
 * One CSV cell. Text a spreadsheet would run as a formula gets a leading
 * quote: application and API names are typed in by people.
 */
function cell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Usage as CSV: one line per time bucket, application, API and status. */
export function toCsv(
  rows: UsageDetailRow[],
  applicationName: (wso2ApplicationId: string) => string,
): string {
  const header = ["start", "application", "api", "status", "calls", "avg_latency_ms"];
  const lines = rows.map((r) => [
    r.bucket.toISOString(),
    applicationName(r.wso2ApplicationId),
    r.apiName,
    r.status,
    r.calls,
    r.latencyCount ? Math.round(r.latencySum / r.latencyCount) : "",
  ]);
  return [header, ...lines].map((line) => line.map(cell).join(",") + "\r\n").join("");
}
