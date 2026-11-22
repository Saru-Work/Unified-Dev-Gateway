import type { Metadata } from "next";
import { updateApplication } from "@/app/actions/applications";
import { getApplication } from "@/lib/applications";
import { getApplicationPolicies } from "@/lib/policies";
import { PageHeader } from "@/app/ui/page-header";
import { ApplicationForm } from "../../application-form";

export async function generateMetadata({
  params,
}: PageProps<"/applications/[id]/edit">): Promise<Metadata> {
  const application = await getApplication((await params).id);
  return { title: `Edit ${application.name} · OpenGate` };
}

export default async function EditApplicationPage({
  params,
}: PageProps<"/applications/[id]/edit">) {
  const [application, policies] = await Promise.all([
    getApplication((await params).id),
    getApplicationPolicies(),
  ]);
  const detailHref = `/applications/${application.id}`;

  return (
    <>
      <PageHeader back={{ href: detailHref, label: application.name }} eyebrow="Applications" title="Edit application" />
      <div className="card max-w-2xl">
      <ApplicationForm
        action={updateApplication.bind(null, application.id)}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={detailHref}
        defaults={{
          name: application.name,
          description: application.description,
          throttlingPolicy: application.throttlingPolicy,
        }}
        policies={policies}
      />
      </div>
    </>
  );
}
