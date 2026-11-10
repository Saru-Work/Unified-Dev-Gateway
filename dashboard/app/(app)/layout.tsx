import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/session";
import { NavLink } from "./nav-link";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireUser();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/applications" className="font-semibold">
            OpenGate
          </Link>
          <nav className="flex gap-1">
            <NavLink href="/applications">Applications</NavLink>
            <NavLink href="/apis">APIs</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted">{user.email}</span>
            <form action={logout}>
              <button type="submit" className="button-secondary">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </>
  );
}
