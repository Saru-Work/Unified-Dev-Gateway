import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CopyButton } from "@/app/copy-button";
import { PageHeader } from "@/app/ui/page-header";
import { getApplication } from "@/lib/applications";
import { formatDate } from "@/lib/format";
import { readUsageRange, UsageSection } from "../../usage/usage-section";
import { DeleteApplication } from "./delete-application";
import { KeysSection } from "./keys-section";
import { SubscriptionsSection } from "./subscriptions-section";

export async function generateMetadata({
  params,
}: PageProps<"/applications/[id]">): Promise<Metadata> {
  const application = await getApplication((await params).id);
  return { title: `${application.name} · OpenGate` };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <span className="truncate text-sm">{children}</span>
    </div>
  );
}

function Id({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1 font-mono text-xs">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export default async function ApplicationPage({
  params,
  searchParams,
}: PageProps<"/applications/[id]">) {
  const application = await getApplication((await params).id);
  const range = readUsageRange((await searchParams).range);

  return (
    <>
      <PageHeader
        back={{ href: "/applications", label: "Applications" }}
        eyebrow="Application"
        title={application.name}
        description={application.description || "No description"}
        actions={
          <Link href={`/applications/${application.id}/edit`} className="button-secondary">
            <Pencil aria-hidden className="size-4" /> Edit
          </Link>
        }
      />

      <section className="card grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Fact label="Throttling policy">{application.throttlingPolicy}</Fact>
        <Fact label="Created">{formatDate(application.createdAt)}</Fact>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 md:col-span-2">
          <Id label="OpenGate ID" value={application.id} />
          <Id label="WSO2 application ID" value={application.wso2ApplicationId} />
        </div>
      </section>

      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-surface" aria-hidden />}>
        <UsageSection
          path={`/applications/${encodeURIComponent(application.id)}/usage`}
          range={range}
          description="Calls this application made through the gateway."
        />
      </Suspense>

      <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-surface" aria-hidden />}>
        <KeysSection applicationId={application.id} />
      </Suspense>

      <Suspense fallback={<div className="h-28 animate-pulse rounded-lg bg-surface" aria-hidden />}>
        <SubscriptionsSection applicationId={application.id} />
      </Suspense>

      <DeleteApplication id={application.id} name={application.name} />
    </>
  );
}
