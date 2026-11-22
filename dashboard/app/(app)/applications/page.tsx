import { AppWindow, ChevronRight, Plus, Search, SearchX } from "lucide-react";
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
        eyebrow="Workspace"
        title="Applications"
        description="An application holds your keys and access tokens, and the APIs it's subscribed to."
        actions={
          <Link href="/applications/new" className="button-primary">
            <Plus aria-hidden className="size-4" /> New application
          </Link>
        }
      />

      {all.length > 0 && (
        <form role="search" className="relative max-w-lg">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="field pl-9"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name, description or policy"
            aria-label="Search applications"
          />
        </form>
      )}

      {query && applications.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`Nothing matches “${query}”`}
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
          You need one to get keys and call the APIs in the catalog.{" "}
          <Link href="/docs#applications" className="link">What&apos;s an application?</Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_190px_20px] gap-6 px-4 md:grid">
            <span className="eyebrow">{applications.length} {applications.length === 1 ? "application" : "applications"}</span>
            <span className="eyebrow">Policy</span>
            <span className="eyebrow">Created</span>
          </div>
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {applications.map((app) => (
              <li key={app.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/applications/${app.id}`}
                  className="group grid items-center gap-x-6 gap-y-1 px-4 py-4 transition-colors hover:bg-surface/50 md:grid-cols-[minmax(0,1fr)_120px_190px_20px]"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium group-hover:text-accent">{app.name}</span>
                    <span className="line-clamp-1 text-sm text-muted">{app.description || "No description"}</span>
                  </span>
                  <span className="font-mono text-xs text-muted">{app.throttlingPolicy}</span>
                  <span className="font-mono text-xs text-muted">{formatDate(app.createdAt)}</span>
                  <ChevronRight aria-hidden className="hidden size-4 text-border-strong transition-colors group-hover:text-foreground md:block" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
