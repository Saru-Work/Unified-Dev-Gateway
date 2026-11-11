import type { Metadata } from "next";
import Link from "next/link";
import { getApplication } from "@/lib/applications";
import { formatDate } from "@/lib/format";
import { Suspense } from "react";
import { DeleteApplication } from "./delete-application";
import { KeysSection } from "./keys-section";

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
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{application.name}</h1>
          <Link href={`/applications/${application.id}/edit`} className="button-secondary">
            Edit
          </Link>
        </div>
      </div>

      <dl className="card grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-sm font-medium text-muted">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>

      <Suspense
        fallback={<div className="h-40 animate-pulse rounded-lg bg-surface" aria-hidden />}
      >
        <KeysSection applicationId={application.id} />
      </Suspense>

      <DeleteApplication id={application.id} name={application.name} />
    </>
  );
}
