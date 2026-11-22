"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** The sidebar as a drawer on small screens. Closes when a link in it is followed. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="button-ghost -ml-2 px-2"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden className="size-5" />
      </button>
      {open &&
        // Into <body>: the sticky header's backdrop blur would otherwise
        // become the box that "fixed" is measured against.
        createPortal(
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) setOpen(false);
              }}
            >
              <button
                type="button"
                className="button-ghost absolute right-3 top-4 px-2"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden className="size-5" />
              </button>
              {children}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
