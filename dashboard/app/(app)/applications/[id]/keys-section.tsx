import { KeyRound } from "lucide-react";
import { backend, describeError } from "@/lib/backend";
import { requireUser } from "@/lib/session";
import type { ApplicationKey, KeyType } from "@/lib/types";
import { KeyPanel } from "./key-panel";

const KEY_TYPES: KeyType[] = ["PRODUCTION", "SANDBOX"];

export async function KeysSection({ applicationId }: { applicationId: string }) {
  const { token } = await requireUser();

  let keys: ApplicationKey[] = [];
  let error: string | undefined;
  try {
    ({ keys } = await backend<{ keys: ApplicationKey[] }>(
      `/applications/${encodeURIComponent(applicationId)}/keys`,
      { token },
    ));
  } catch (err) {
    error = describeError(err);
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
          <KeyRound aria-hidden className="size-5 text-accent" /> OAuth keys
        </h2>
        <p className="text-sm text-muted">
          Client-credentials keys for getting access tokens from WSO2.
        </p>
      </div>

      {error && <p className="notice-error">Couldn&apos;t load keys: {error}</p>}

      {!error && (
        <div className="grid gap-4 md:grid-cols-2">
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
