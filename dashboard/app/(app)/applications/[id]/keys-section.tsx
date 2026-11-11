import { backend, describeError } from "@/lib/backend";
import { getWso2Token, requireUser } from "@/lib/session";
import type { ApplicationKey, KeyType } from "@/lib/types";
import { Wso2TokenNotice } from "../../wso2-token-notice";
import { KeyPanel } from "./key-panel";

const KEY_TYPES: KeyType[] = ["PRODUCTION", "SANDBOX"];

export async function KeysSection({ applicationId }: { applicationId: string }) {
  const { token } = await requireUser();
  const wso2Token = await getWso2Token();

  let keys: ApplicationKey[] = [];
  let error: string | undefined;
  if (wso2Token) {
    try {
      ({ keys } = await backend<{ keys: ApplicationKey[] }>(
        `/applications/${encodeURIComponent(applicationId)}/keys`,
        { token, wso2Token },
      ));
    } catch (err) {
      error = describeError(err);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">OAuth keys</h2>
        <p className="text-sm text-muted">
          Client-credentials keys for getting access tokens from WSO2.
        </p>
      </div>

      <Wso2TokenNotice action="view or generate keys" />
      {error && <p className="notice-error">Couldn&apos;t load keys: {error}</p>}

      {wso2Token && !error && (
        <div className="grid gap-3 md:grid-cols-2">
          {KEY_TYPES.map((keyType) => (
            <KeyPanel
              key={keyType}
              applicationId={applicationId}
              keyType={keyType}
              existing={keys.find((k) => k.keyType === keyType)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
