import type { Metadata } from "next";
import Link from "next/link";
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <p className="text-sm text-muted">
            Applications you&apos;ve created in WSO2 API Manager.
          </p>
        </div>
        <Link href="/applications/new" className="button-primary">
          New application
        </Link>
      </div>

      {all.length > 0 && (
        <form role="search" className="flex max-w-md gap-2">
          <input
            className="field"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name, description or policy"
            aria-label="Search applications"
          />
          <button type="submit" className="button-secondary">
            Search
          </button>
        </form>
      )}

      {query && applications.length === 0 ? (
        <div className="card flex flex-col items-start gap-2">
          <p className="font-medium">No applications match “{query}”</p>
          <Link href="/applications" className="link text-sm">
            Show all applications
          </Link>
        </div>
      ) : applications.length === 0 ? (
        <div className="card flex flex-col items-start gap-2">
          <p className="font-medium">No applications yet</p>
          <p className="text-sm text-muted">
            Create an application to get credentials for calling the APIs
            published in WSO2.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {applications.map((app) => (
            <li key={app.id}>
              <Link
                href={`/applications/${app.id}`}
                className="card flex flex-col gap-1 hover:bg-surface"
              >
                <span className="font-medium">{app.name}</span>
                {app.description && (
                  <span className="text-sm text-muted">{app.description}</span>
                )}
                <span className="text-xs text-muted">
                  Created {formatDate(app.createdAt)} · {app.throttlingPolicy}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
