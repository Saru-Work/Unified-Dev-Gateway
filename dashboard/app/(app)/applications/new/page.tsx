import type { Metadata } from "next";
import { createApplication } from "@/app/actions/applications";
import { getApplicationPolicies } from "@/lib/policies";
import { PageHeader } from "@/app/ui/page-header";
import { ApplicationForm } from "../application-form";

export const metadata: Metadata = { title: "New application · OpenGate" };

export default async function NewApplicationPage() {
  const policies = await getApplicationPolicies();

  return (
    <>
      <PageHeader
        back={{ href: "/applications", label: "Applications" }}
        eyebrow="Applications"
        title="New application"
        description="Create an application to get keys and subscribe to APIs."
      />
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="card">
          <ApplicationForm
            action={createApplication}
            submitLabel="Create application"
            pendingLabel="Creating…"
            cancelHref="/applications"
            policies={policies}
          />
        </div>
      <aside className="flex flex-col gap-3 border-l-2 border-accent pl-4 text-sm">
        <span className="eyebrow">Good to know</span>
        <ul className="flex flex-col gap-2 text-muted">
          <li>Names must be unique across OpenGate, so make yours specific.</li>
          <li>The throttling policy caps how many requests all of this app&apos;s tokens can make.</li>
          <li>Next, generate keys and subscribe it to APIs from the catalog.</li>
        </ul>
      </aside>
      </div>
    </>
  );
}
