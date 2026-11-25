import Link from "next/link";
import { backend, describeError } from "@/lib/backend";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { Usage } from "@/lib/types";
import { UsageChart } from "./usage-chart";

export const USAGE_RANGES = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const;
export type UsageRange = (typeof USAGE_RANGES)[number]["value"];

/** A `?range=` value, or the last 24 hours if it isn't one. */
export function readUsageRange(value: string | string[] | undefined): UsageRange {
  return USAGE_RANGES.find((r) => r.value === value)?.value ?? "24h";
}

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No content",
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  429: "Throttled",
  500: "Server error",
  502: "Bad gateway",
  503: "Unavailable",
  504: "Gateway timeout",
};

const number = new Intl.NumberFormat("en");
const percent = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="eyebrow">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

interface UsageSectionProps {
  /** Backend path that returns the usage: one application's, or the account's. */
  path: string;
  range: UsageRange;
  title?: string;
  description: string;
}

export async function UsageSection({ path, range, title = "Usage", description }: UsageSectionProps) {
  const { token } = await requireUser();
  let usage: Usage;
  try {
    usage = await backend<Usage>(`${path}?range=${range}`, { token });
  } catch (err) {
    return (
      <section id="usage" className="flex scroll-mt-8 flex-col gap-3">
        <h2 className="display text-2xl">{title}</h2>
        <p className="notice-error">Couldn&apos;t load usage: {describeError(err)}</p>
      </section>
    );
  }

  return (
    <section id="usage" className="flex scroll-mt-8 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
        {usage.enabled && (
          <nav aria-label="Time range" className="inline-flex rounded-md border border-border bg-surface p-0.5 text-xs">
            {USAGE_RANGES.map((r) => (
              <Link
                key={r.value}
                href={`?range=${r.value}#usage`}
                scroll={false}
                aria-current={r.value === range ? "page" : undefined}
                className={
                  "rounded border px-2.5 py-1 font-medium " +
                  (r.value === range ? "border-border bg-card text-foreground" : "border-transparent text-muted hover:text-foreground")
                }
              >
                {r.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {!usage.enabled ? (
        <p className="notice-info">
          Usage isn&apos;t being collected on this server. It needs the gateway&apos;s analytics
          log; see the README.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card md:grid-cols-4 [&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(n+3)]:border-t-0 [&>*:nth-child(even)]:border-l md:[&>*:not(:first-child)]:border-l [&>*]:border-border">
            <Stat label="Calls" value={number.format(usage.totals.calls)} />
            <Stat
              label="Error rate"
              value={usage.totals.calls ? percent.format(usage.totals.errorRate) : "—"}
              note={`${number.format(usage.totals.errors)} errors`}
            />
            <Stat
              label="Throttled"
              value={number.format(usage.totals.throttled)}
              note="429s from tier or shared limits"
            />
            <Stat
              label="Latency p95"
              value={usage.totals.p95LatencyMs !== undefined ? `${number.format(usage.totals.p95LatencyMs)} ms` : "—"}
              note={usage.totals.avgLatencyMs !== undefined ? `avg ${number.format(usage.totals.avgLatencyMs)} ms` : undefined}
            />
          </div>

          {usage.totals.calls === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-strong px-5 py-6 text-sm">
              <p className="font-medium">No calls in this period</p>
              <p className="text-muted">
                {usage.lastCallAt
                  ? `The last call was ${formatDate(usage.lastCallAt)}.`
                  : "Calls show up here a few seconds after they go through the gateway."}{" "}
                <Link href="/docs#calling-an-api" className="link">How to call an API</Link>
              </p>
            </div>
          ) : (
            <>
              <div className="card flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">Calls per {usage.unit}</span>
                  <span className="font-mono text-[11px] text-muted">UTC</span>
                </div>
                <UsageChart series={usage.series} unit={usage.unit} />
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted hover:text-foreground">Show as a table</summary>
                  <div className="mt-3 max-h-64 overflow-auto">
                    <table className="w-full text-left">
                      <thead className="eyebrow">
                        <tr>
                          <th className="py-1 pr-4 font-medium">{usage.unit === "hour" ? "Hour starting" : "Day"}</th>
                          <th className="py-1 pr-4 text-right font-medium">Calls</th>
                          <th className="py-1 text-right font-medium">Errors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-mono text-xs">
                        {usage.series.map((p) => (
                          <tr key={p.start}>
                            <td className="py-1 pr-4">{formatDate(p.start)}</td>
                            <td className="py-1 pr-4 text-right">{number.format(p.calls)}</td>
                            <td className="py-1 text-right">{number.format(p.errors)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>

              {usage.applications && (
                <div className="flex flex-col gap-2">
                  <span className="eyebrow">By application</span>
                  <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-sm">
                    <thead className="border-b border-border text-xs text-muted">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Application</th>
                        <th className="px-4 py-2 text-right font-medium">Calls</th>
                        <th className="px-4 py-2 text-right font-medium">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {usage.applications.map((a) => (
                        <tr key={a.applicationId}>
                          <td className="px-4 py-2">
                            <Link href={`/applications/${a.applicationId}?range=${range}#usage`} className="hover:text-accent">
                              {a.name}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{number.format(a.calls)}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{number.format(a.errors)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div className="flex flex-col gap-2">
                  <span className="eyebrow">By API</span>
                  <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-sm">
                    <thead className="border-b border-border text-xs text-muted">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">API</th>
                        <th className="px-4 py-2 text-right font-medium">Calls</th>
                        <th className="px-4 py-2 text-right font-medium">Errors</th>
                        <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Avg latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {usage.apis.map((a) => (
                        <tr key={a.apiId}>
                          <td className="px-4 py-2">
                            <Link href={`/apis/${a.apiId}`} className="hover:text-accent">{a.apiName}</Link>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{number.format(a.calls)}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{number.format(a.errors)}</td>
                          <td className="hidden px-4 py-2 text-right font-mono text-xs sm:table-cell">
                            {a.avgLatencyMs !== undefined ? `${number.format(a.avgLatencyMs)} ms` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="eyebrow">Responses</span>
                  <ul className="overflow-hidden rounded-lg border border-border bg-card text-sm">
                    {usage.statuses.map((s) => (
                      <li key={s.status} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
                        <code className="font-mono text-xs">{s.status}</code>
                        <span className="flex-1 text-muted">{STATUS_TEXT[s.status] ?? ""}</span>
                        <span className="font-mono text-xs">{number.format(s.calls)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-xs text-muted">
                Calls rejected before the gateway knows the application (a missing or invalid token,
                or a path the API doesn&apos;t have) aren&apos;t counted. Usage is kept for 30 days.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
