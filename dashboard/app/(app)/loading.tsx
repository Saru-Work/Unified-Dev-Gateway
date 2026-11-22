export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-4">
        <div className="size-11 animate-pulse rounded-xl bg-surface" />
        <div className="flex flex-col gap-2">
          <div className="h-6 w-48 animate-pulse rounded-md bg-surface" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-surface" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
