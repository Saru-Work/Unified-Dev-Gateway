"use client";

import { ErrorPanel, type ErrorProps } from "./error-panel";

// Catches failures in the (app) layout itself, e.g. the backend being down
// while the session is verified.
export default function RootError(props: ErrorProps) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <ErrorPanel {...props} />
    </main>
  );
}
