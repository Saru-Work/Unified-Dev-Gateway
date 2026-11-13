"use client";

import { useActionState, useState } from "react";
import { generateKeys, regenerateSecret } from "@/app/actions/applications";
import { CopyButton } from "@/app/copy-button";
import type { ApplicationKey, GenerateKeyState, KeyType } from "@/lib/types";

const LABELS: Record<KeyType, string> = {
  PRODUCTION: "Production",
  SANDBOX: "Sandbox",
};

interface KeyPanelProps {
  applicationId: string;
  keyType: KeyType;
  /** The key WSO2 already has for this environment, if any (no secret). */
  existing?: ApplicationKey;
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-surface px-2 py-1 font-mono text-sm">
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function KeyPanel({ applicationId, keyType, existing }: KeyPanelProps) {
  const [state, formAction, pending] = useActionState<GenerateKeyState>(
    generateKeys.bind(null, applicationId, keyType),
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const [regenerated, regenerateAction, regenerating] = useActionState(
    regenerateSecret.bind(null, applicationId, existing?.keyMappingId ?? ""),
    {},
  );
  const generated = state.key ?? existing;
  const key = generated && {
    ...generated,
    consumerSecret: regenerated.consumerSecret ?? generated.consumerSecret,
  };
  const error = state.error ?? regenerated.error;

  return (
    <div className="card flex flex-col gap-3">
      <h3 className="font-semibold">{LABELS[keyType]}</h3>

      {error && (
        <p role="alert" className="notice-error">
          {error}
        </p>
      )}

      {key ? (
        <>
          <Value label="Consumer key" value={key.consumerKey} />
          {key.consumerSecret ? (
            <>
              <Value label="Consumer secret" value={key.consumerSecret} />
              <p className="notice-info">
                Copy the secret now. OpenGate doesn&apos;t store it and won&apos;t
                show it again.
              </p>
            </>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-xs text-muted">
                The consumer secret was shown once, when these keys were generated.
              </p>
              {key.keyMappingId &&
                (confirming ? (
                  <form
                    action={regenerateAction}
                    onSubmit={() => setConfirming(false)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-sm">The current secret stops working at once.</span>
                    <button type="submit" className="button-danger">
                      Regenerate
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={regenerating}
                    onClick={() => setConfirming(true)}
                  >
                    {regenerating ? "Regenerating…" : "Regenerate secret…"}
                  </button>
                ))}
            </div>
          )}
          {key.supportedGrantTypes.length > 0 && (
            <p className="text-xs text-muted">
              Grant types: {key.supportedGrantTypes.join(", ")}
            </p>
          )}
        </>
      ) : (
        <form action={formAction} className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">No keys yet.</p>
          <button type="submit" className="button-secondary" disabled={pending}>
            {pending ? "Generating…" : "Generate keys"}
          </button>
        </form>
      )}
    </div>
  );
}
