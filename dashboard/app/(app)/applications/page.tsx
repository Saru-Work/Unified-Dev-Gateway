import { AppWindow, CalendarClock, Gauge, Plus, Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/app/ui/empty-state";
import { PageHeader } from "@/app/ui/page-header";
import { backend } from "@/lib/backend";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { Application } from "@/lib/types";

export const metadata: Metadata = { title: "Applications · OpenGate" };

function matches(app: Application, query: string): boolean {
  const q = query.toLowerCase();
  return [app.name, app.description, app.throttlingPolicy].some((value) =>
    value?.toLowerCase().includes(q),
  );
}

export default async function ApplicationsPage({
  searchParams,
}: PageProps<"/applications">) {
  const { token } = await requireUser();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const { applications: all } = await backend<{ applications: Application[] }>(
    "/applications",
    { token },
  );
  const applications = query ? all.filter((app) => matches(app, query)) : all;

  return (
    <>
      <PageHeader
        icon={AppWindow}
        title="Applications"
        description="Each application has its own keys, access tokens and API subscriptions."
        actions={
          <Link href="/applications/new" className="button-primary">
            <Plus aria-hidden className="size-4" /> New application
          </Link>
        }
      />

      {all.length > 0 && (
        <form role="search" className="relative max-w-xl">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="field py-2.5 pl-9"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name, description or policy"
            aria-label="Search applications"
          />
        </form>
      )}

      {query && applications.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`No applications match “${query}”`}
          action={<Link href="/applications" className="button-secondary">Show all applications</Link>}
        />
      ) : applications.length === 0 ? (
        <EmptyState
          icon={AppWindow}
          title="No applications yet"
          action={
            <Link href="/applications/new" className="button-primary">
              <Plus aria-hidden className="size-4" /> Create your first application
            </Link>
          }
        >
          An application gets you keys and access tokens for calling the APIs in the catalog.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {applications.map((app) => (
            <li key={app.id}>
              <Link href={`/applications/${app.id}`} className="card card-link flex h-full flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span className="icon-tile tone-indigo size-11">
                    <AppWindow aria-hidden className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{app.name}</span>
                    <span className="line-clamp-2 text-sm text-muted">
                      {app.description || "No description"}
                    </span>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock aria-hidden className="size-3.5" />
                    {formatDate(app.createdAt)}
                  </span>
                  <span className="badge-accent">
                    <Gauge aria-hidden className="size-3" /> {app.throttlingPolicy}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
