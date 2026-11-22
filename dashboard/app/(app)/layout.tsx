import { AppWindow, BookOpen, Boxes, LayoutGrid, LogOut, Plus, Settings } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/app/ui/logo";
import { ThemeSwitcher } from "@/app/ui/theme-switcher";
import { requireUser } from "@/lib/session";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";

function Sidebar({ email, theme }: { email: string; theme: Theme }) {
  return (
    <div className="flex h-full flex-col gap-7 px-5 py-6">
      <Logo href="/dashboard" />

      <Link href="/applications/new" className="button-primary w-full">
        <Plus aria-hidden className="size-4" /> New application
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow mb-1.5 px-2.5">Workspace</span>
          <NavLink href="/dashboard" icon={<LayoutGrid aria-hidden strokeWidth={1.75} />}>Overview</NavLink>
          <NavLink href="/apis" icon={<Boxes aria-hidden strokeWidth={1.75} />}>API catalog</NavLink>
          <NavLink href="/applications" icon={<AppWindow aria-hidden strokeWidth={1.75} />}>Applications</NavLink>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow mb-1.5 px-2.5">Help</span>
          <NavLink href="/docs" icon={<BookOpen aria-hidden strokeWidth={1.75} />}>Documentation</NavLink>
          <NavLink href="/settings" icon={<Settings aria-hidden strokeWidth={1.75} />}>Settings</NavLink>
        </div>
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-col px-1">
          <span className="eyebrow">Signed in</span>
          <span className="truncate text-sm" title={email}>{email}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <ThemeSwitcher initial={theme} />
          <form action={logout}>
            <button type="submit" className="button-ghost">
              <LogOut aria-hidden className="size-4" /> Sign out
            </button>
          </form>
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
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border lg:block">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background px-4 py-3 lg:hidden">
          <MobileNav>{sidebar}</MobileNav>
          <Logo href="/dashboard" />
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
