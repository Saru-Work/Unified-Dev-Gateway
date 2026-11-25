import { Download } from "lucide-react";
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
        actions={
          // A plain link: it's a download, not a page to prefetch.
          <a href={`/usage-export?range=${range}`} className="button-secondary" download>
            <Download aria-hidden className="size-4" /> Download CSV
          </a>
        }
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
