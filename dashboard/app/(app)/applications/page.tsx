import type { Metadata } from "next";
import Link from "next/link";
import { backend } from "@/lib/backend";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { Application } from "@/lib/types";

export const metadata: Metadata = { title: "Applications · OpenGate" };

export default async function ApplicationsPage() {
  const { token } = await requireUser();
  const { applications } = await backend<{ applications: Application[] }>(
    "/applications",
    { token },
  );

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

      {applications.length === 0 ? (
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
                  Created {formatDate(app.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
