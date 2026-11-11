import type { Metadata } from "next";
import Link from "next/link";
import { createApplication } from "@/app/actions/applications";
import { ApplicationForm } from "../application-form";
import { Wso2TokenNotice } from "../../wso2-token-notice";

export const metadata: Metadata = { title: "New application · OpenGate" };

export default function NewApplicationPage() {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <Link href="/applications" className="text-sm text-muted hover:text-foreground">
          ← Applications
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New application</h1>
      </div>

      <Wso2TokenNotice action="create applications" />

      <ApplicationForm
        action={createApplication}
        submitLabel="Create application"
        pendingLabel="Creating…"
        cancelHref="/applications"
      />
    </div>
  );
}
