import type { Metadata } from "next";
import { clearWso2Token } from "@/app/actions/wso2";
import { getWso2Token, requireUser } from "@/lib/session";
import { PasswordForm } from "./password-form";
import { Wso2TokenForm } from "./wso2-token-form";

export const metadata: Metadata = { title: "Settings · OpenGate" };

export default async function SettingsPage() {
  const { user } = await requireUser();
  const hasToken = Boolean(await getWso2Token());

  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="card flex max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">WSO2 access token</h2>
          <p className="text-sm text-muted">
            Creating and deleting applications happens inside WSO2 API Manager,
            so OpenGate needs a WSO2 DevPortal access token with the{" "}
            <code className="font-mono">apim:subscribe</code> and{" "}
            <code className="font-mono">apim:app_manage</code> scopes. It&apos;s
            kept in a secure cookie on this browser only and is never shown again.
          </p>
        </div>

        <p className={hasToken ? "notice-info" : "notice-error"}>
          {hasToken
            ? "A WSO2 token is saved for this session."
            : "No WSO2 token saved. You can browse, but not create or delete applications."}
        </p>

        <Wso2TokenForm />

        {hasToken && (
          <form action={clearWso2Token}>
            <button type="submit" className="button-secondary">
              Forget saved token
            </button>
          </form>
        )}
      </section>

      <section className="card flex max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Password</h2>
          <p className="text-sm text-muted">
            Change the password for <strong>{user.email}</strong>.
          </p>
        </div>
        <PasswordForm />
      </section>
    </>
  );
}
