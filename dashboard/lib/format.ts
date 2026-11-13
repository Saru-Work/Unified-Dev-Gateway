const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Formats an ISO timestamp the same way on the server and in the browser. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${dateFormat.format(date)} UTC`;
}

// WSO2 reports "Unlimited" as Integer.MAX_VALUE requests.
const UNLIMITED_REQUESTS = 2_147_483_647;

/** "10 requests per minute" style summary of a throttling policy's limit. */
export function formatPolicyLimit(policy: {
  requestCount?: number;
  unitTime?: number;
  timeUnit?: string;
}): string | undefined {
  const { requestCount, unitTime, timeUnit } = policy;
  if (requestCount === undefined || requestCount >= UNLIMITED_REQUESTS) return undefined;
  const requests = `${requestCount.toLocaleString("en")} request${requestCount === 1 ? "" : "s"}`;
  if (!unitTime || !timeUnit) return requests;
  return unitTime === 1 ? `${requests} per ${timeUnit}` : `${requests} per ${unitTime} ${timeUnit}`;
}
