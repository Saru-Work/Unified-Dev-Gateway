"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Applies a theme to the page now and remembers it for server renders. */
function applyTheme(value: Theme) {
  document.documentElement.dataset.theme = value;
  document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** Light / dark / system switch. Saved in a cookie so the server renders the same theme. */
export function ThemeSwitcher({ initial, showLabels = false }: { initial: Theme; showLabels?: boolean }) {
  const [theme, setTheme] = useState(initial);

  function choose(value: Theme) {
    setTheme(value);
    applyTheme(value);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-md border border-border bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={
            "inline-flex items-center gap-1.5 rounded border border-transparent px-2 py-1 text-xs font-medium transition-colors " +
            (theme === value ? "bg-card text-foreground border border-border" : "text-muted hover:text-foreground")
          }
        >
          <Icon aria-hidden className="size-4" />
          <span className={showLabels ? "" : "sr-only"}>{label}</span>
        </button>
      ))}
    </div>
  );
}
