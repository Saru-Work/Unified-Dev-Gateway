"use client";

import { useState } from "react";

interface Point {
  start: string;
  calls: number;
  errors: number;
}

const hourFormat = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** Clean axis ticks (multiples of 1, 2 or 5) from 0 to at least `max`. */
function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step));
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

/**
 * Calls per hour or day as columns: one series, so no legend (the section
 * title names it). Each column is focusable and shows a tooltip with its
 * calls and errors; the table view below carries the same numbers.
 */
export function UsageChart({ series, unit }: { series: Point[]; unit: "hour" | "day" }) {
  const [active, setActive] = useState<number | null>(null);
  const yTicks = ticks(Math.max(...series.map((p) => p.calls)));
  const top = yTicks.at(-1) || 1;
  const label = (iso: string) => (unit === "hour" ? hourFormat : dayFormat).format(new Date(iso));
  // Label about six columns along the axis, never crowding.
  const every = Math.max(1, Math.ceil(series.length / 6));
  const axisFormat = top >= 10_000 ? compact : full;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex h-48 pl-10">
        {/* Gridlines and y-axis: hairline, recessive. */}
        {yTicks.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute right-0 left-10 border-t border-border"
            style={{ bottom: `${(t / top) * 100}%` }}
          >
            <span className="absolute -left-10 w-8 -translate-y-1/2 text-right font-mono text-[10px] text-muted">
              {axisFormat.format(t)}
            </span>
          </div>
        ))}

        <ol className="relative flex h-full flex-1 items-end gap-0.5" aria-label="Calls over time">
          {series.map((p, i) => {
            const height = (p.calls / top) * 100;
            const isActive = active === i;
            return (
              <li key={p.start} className="relative flex h-full flex-1 items-end justify-center">
                <button
                  type="button"
                  className="flex h-full w-full items-end justify-center outline-none"
                  aria-label={`${label(p.start)}: ${full.format(p.calls)} calls, ${full.format(p.errors)} errors`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                >
                  <span
                    className="block w-full max-w-6 rounded-t transition-opacity"
                    style={{
                      height: `${height}%`,
                      minHeight: p.calls > 0 ? 2 : 0,
                      background: "var(--chart-series)",
                      opacity: active === null || isActive ? 1 : 0.55,
                    }}
                  />
                </button>
                {isActive && (
                  <div
                    role="tooltip"
                    className={
                      "pointer-events-none absolute bottom-full z-10 mb-2 flex min-w-36 flex-col gap-1 rounded-md border border-border-strong bg-card px-3 py-2 text-xs shadow-sm " +
                      (i < series.length / 2 ? "left-0" : "right-0")
                    }
                  >
                    <span className="text-muted">
                      {unit === "hour" ? `${dayFormat.format(new Date(p.start))}, ${label(p.start)} UTC` : `${label(p.start)} (UTC)`}
                    </span>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: "var(--chart-series)" }} />
                      <strong className="font-semibold">{full.format(p.calls)}</strong>
                      <span className="text-muted">calls</span>
                    </span>
                    <span className="flex items-center gap-2 pl-5">
                      <strong className="font-semibold">{full.format(p.errors)}</strong>
                      <span className="text-muted">errors</span>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <ol aria-hidden className="flex gap-0.5 pl-10">
        {series.map((p, i) => (
          <li key={p.start} className="relative h-4 flex-1">
            {i % every === 0 && (
              <span className="absolute left-0 whitespace-nowrap font-mono text-[10px] text-muted">{label(p.start)}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
