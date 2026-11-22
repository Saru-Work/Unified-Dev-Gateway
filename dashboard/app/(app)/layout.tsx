import { AppWindow, Boxes, LayoutDashboard, LogOut, Settings, Sparkles } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/app/ui/logo";
import { ThemeSwitcher } from "@/app/ui/theme-switcher";
import { requireUser } from "@/lib/session";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";

function Sidebar({ email, theme }: { email: string; theme: ReturnType<typeof parseTheme> }) {
  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <div className="px-2">
        <Logo href="/dashboard" />
      </div>

      <nav aria-label="Main" className="flex flex-col gap-1">
        <NavLink href="/dashboard" icon={<LayoutDashboard aria-hidden />}>Overview</NavLink>
        <NavLink href="/apis" icon={<Boxes aria-hidden />}>API catalog</NavLink>
        <NavLink href="/applications" icon={<AppWindow aria-hidden />}>Applications</NavLink>
        <NavLink href="/settings" icon={<Settings aria-hidden />}>Settings</NavLink>
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <Link
          href="/applications/new"
          className="hero-bg flex flex-col gap-1 rounded-xl border border-border p-4 transition-colors hover:border-accent"
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Sparkles aria-hidden className="size-4 text-accent" />
            New application
          </span>
          <span className="text-xs text-muted">Get keys and start calling APIs in minutes.</span>
        </Link>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-3 px-1">
            <span
              aria-hidden
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold uppercase text-accent"
            >
              {email.charAt(0)}
            </span>
            <span className="min-w-0 truncate text-sm" title={email}>
              {email}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <ThemeSwitcher initial={theme} />
            <form action={logout}>
              <button type="submit" className="button-ghost px-2" title="Sign out">
                <LogOut aria-hidden className="size-4" />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireUser();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const sidebar = <Sidebar email={user.email} theme={theme} />;

  return (
    <div className="flex min-h-full flex-1">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-card lg:block">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
          <MobileNav>{sidebar}</MobileNav>
          <Logo href="/dashboard" />
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
