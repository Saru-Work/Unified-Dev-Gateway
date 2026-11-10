"use client";

import { useEffect } from "react";

export interface ErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/** Shared body for the error.tsx boundaries. */
export function ErrorPanel({ error, retry }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="card flex max-w-xl flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">
        The page couldn&apos;t be loaded. The OpenGate backend or WSO2 API
        Manager may be unavailable; try again in a moment.
      </p>
      {error.digest && (
        <p className="text-xs text-muted">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      )}
      <button type="button" className="button-primary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
