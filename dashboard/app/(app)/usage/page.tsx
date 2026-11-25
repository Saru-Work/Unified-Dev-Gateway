import type { Metadata } from "next";
import { PageHeader } from "@/app/ui/page-header";
import { readUsageRange, UsageSection } from "./usage-section";

export const metadata: Metadata = { title: "Usage · OpenGate" };

export default async function UsagePage({ searchParams }: PageProps<"/usage">) {
  const range = readUsageRange((await searchParams).range);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Usage"
        description="Everything your applications called through the gateway, in one place."
      />
      <UsageSection
        path="/usage"
        range={range}
        title="All applications"
        description="Calls from every application you own."
      />
    </>
  );
}
