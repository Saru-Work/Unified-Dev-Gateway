import type { Metadata } from "next";
import Link from "next/link";
import { updateApplication } from "@/app/actions/applications";
import { getApplication } from "@/lib/applications";
import { getApplicationPolicies } from "@/lib/policies";
import { ApplicationForm } from "../../application-form";
import { Wso2TokenNotice } from "../../../wso2-token-notice";

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
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <Link href={detailHref} className="text-sm text-muted hover:text-foreground">
          ← {application.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Edit application</h1>
      </div>

      <Wso2TokenNotice action="edit applications" />

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
  );
}
