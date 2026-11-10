"use client";

import { ErrorPanel, type ErrorProps } from "../error-panel";

// Inside the signed-in shell, so the header and navigation stay usable.
export default function AppError(props: ErrorProps) {
  return <ErrorPanel {...props} />;
}
