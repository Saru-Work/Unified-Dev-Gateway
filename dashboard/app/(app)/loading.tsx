export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="h-3 w-20 animate-pulse rounded bg-surface" />
        <div className="h-10 w-64 animate-pulse rounded bg-surface" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-surface" />
      </div>
      <div className="flex flex-col overflow-hidden rounded-lg border border-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse border-b border-border bg-surface/40 last:border-b-0" />
        ))}
      </div>
    </div>
  );
}
