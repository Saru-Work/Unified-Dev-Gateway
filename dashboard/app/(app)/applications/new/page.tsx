import type { Metadata } from "next";
import { Lightbulb, Plus } from "lucide-react";
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
        icon={Plus}
        title="New application"
        description="Create an application to get keys and subscribe to APIs."
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <ApplicationForm
            action={createApplication}
            submitLabel="Create application"
            pendingLabel="Creating…"
            cancelHref="/applications"
            policies={policies}
          />
        </div>
      <aside className="card hero-bg flex flex-col gap-3 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Lightbulb aria-hidden className="size-4 text-accent" /> Good to know
        </span>
        <ul className="flex flex-col gap-2 text-muted">
          <li>Names must be unique across OpenGate, so make yours specific.</li>
          <li>The throttling policy caps how many requests all of this app&apos;s tokens can make.</li>
          <li>After creating it, generate keys and subscribe it to APIs from the catalog.</li>
        </ul>
      </aside>
      </div>
    </>
  );
}
