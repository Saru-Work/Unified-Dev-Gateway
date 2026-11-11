export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-48 animate-pulse rounded-md bg-surface" />
      <div className="h-20 animate-pulse rounded-lg bg-surface" />
      <div className="h-20 animate-pulse rounded-lg bg-surface" />
    </div>
  );
}
