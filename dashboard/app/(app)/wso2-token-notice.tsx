import Link from "next/link";
import { getWso2Token } from "@/lib/session";

/** Warns, before the user fills in a form, that the action needs a WSO2 token. */
export async function Wso2TokenNotice({ action }: { action: string }) {
  if (await getWso2Token()) return null;
  return (
    <p className="notice-error">
      You need a WSO2 access token to {action}.{" "}
      <Link href="/settings" className="link">
        Add one in Settings
      </Link>
      .
    </p>
  );
}
