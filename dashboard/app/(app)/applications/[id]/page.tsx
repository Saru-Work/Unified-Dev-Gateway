import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { backend, BackendError } from "@/lib/backend";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { Application } from "@/lib/types";
import { DeleteApplication } from "./delete-application";

/** Shared by generateMetadata and the page so the backend is called once. */
const getApplication = cache(async (id: string): Promise<Application> => {
  const { token } = await requireUser();
  try {
    const { application } = await backend<{ application: Application }>(
      `/applications/${encodeURIComponent(id)}`,
      { token },
    );
    return application;
  } catch (err) {
    // The backend answers 404 for unknown ids and other users' apps alike.
    if (err instanceof BackendError && err.status === 404) notFound();
    throw err;
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/applications/[id]">): Promise<Metadata> {
  const application = await getApplication((await params).id);
  return { title: `${application.name} · OpenGate` };
}

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const application = await getApplication((await params).id);

  const rows: [string, React.ReactNode][] = [
    ["Description", application.description || <span className="text-muted">None</span>],
    ["Created", formatDate(application.createdAt)],
    ["OpenGate ID", <code key="id" className="font-mono text-sm">{application.id}</code>],
    [
      "WSO2 application ID",
      <code key="wso2" className="font-mono text-sm">{application.wso2ApplicationId}</code>,
    ],
  ];

  return (
    <>
      <div>
        <Link href="/applications" className="text-sm text-muted hover:text-foreground">
          ← Applications
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{application.name}</h1>
      </div>

      <dl className="card grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-sm font-medium text-muted">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>

      <DeleteApplication id={application.id} name={application.name} />
    </>
  );
}
