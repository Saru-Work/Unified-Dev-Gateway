import { cookies } from "next/headers";
import Link from "next/link";
import { SESSION_COOKIE } from "@/lib/session";
import { Logo } from "./logo";

/** Header for public pages (landing, docs). */
export async function SiteHeader({ current }: { current?: "docs" }) {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/docs"
            aria-current={current === "docs" ? "page" : undefined}
            className={current === "docs" ? "button-ghost text-foreground" : "button-ghost"}
          >
            Docs
          </Link>
          {signedIn ? (
            <Link href="/dashboard" className="button-primary">Workspace</Link>
          ) : (
            <>
              <Link href="/login" className="button-ghost">Sign in</Link>
              <Link href="/register" className="button-primary">Get started</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
