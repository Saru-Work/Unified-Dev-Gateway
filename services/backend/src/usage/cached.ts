/**
 * Shares one result of `load` for `ttlMs`, so a public endpoint can't be used
 * to run an expensive query on every request. Failures aren't kept.
 */
export function cached<T>(load: () => Promise<T>, ttlMs: number, now: () => number = Date.now): () => Promise<T> {
  let entry: { value: Promise<T>; expires: number } | undefined;
  return () => {
    if (entry && entry.expires > now()) return entry.value;
    const current = { value: load(), expires: now() + ttlMs };
    entry = current;
    current.value.catch(() => {
      if (entry === current) entry = undefined;
    });
    return current.value;
  };
}
