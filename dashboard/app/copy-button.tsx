"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (e.g. non-HTTPS origins); the value is still selectable.
    }
  }

  return (
    <button type="button" className="button-secondary" onClick={copy}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
