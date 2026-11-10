import type { Metadata } from "next";
import Link from "next/link";
import { getWso2Token } from "@/lib/session";
import { CreateApplicationForm } from "./create-form";

export const metadata: Metadata = { title: "New application · OpenGate" };

export default async function NewApplicationPage() {
  const hasWso2Token = Boolean(await getWso2Token());

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <Link href="/applications" className="text-sm text-muted hover:text-foreground">
          ← Applications
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New application</h1>
      </div>

      {!hasWso2Token && (
        <p className="notice-error">
          You need a WSO2 access token to create applications.{" "}
          <Link href="/settings" className="link">
            Add one in Settings
          </Link>
          .
        </p>
      )}

      <CreateApplicationForm />
    </div>
  );
}
