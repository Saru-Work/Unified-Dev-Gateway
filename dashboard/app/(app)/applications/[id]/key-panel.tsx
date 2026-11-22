"use client";

import { FlaskConical, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteKeys, generateKeys, regenerateSecret } from "@/app/actions/applications";
import { CopyButton } from "@/app/copy-button";
import { AccessToken } from "./access-token";
import type { ApplicationKey, GenerateKeyState, KeyType } from "@/lib/types";

const LABELS: Record<KeyType, { label: string; hint: string; icon: typeof ShieldCheck }> = {
  PRODUCTION: { label: "Production", hint: "Calls the live backend", icon: ShieldCheck },
  SANDBOX: { label: "Sandbox", hint: "Calls the sandbox backend, if the API has one", icon: FlaskConical },
};

/** Outcome of deleting keys: which ones went, or why it failed. */
interface DeleteState {
  error?: string;
  keyMappingId?: string;
}

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, deleteAction, deleting] = useActionState<DeleteState, FormData>(
    async (_prev, formData) => {
      const keyMappingId = String(formData.get("keyMappingId") ?? "");
      const result = await deleteKeys(applicationId, keyMappingId);
      return result.error ? { error: result.error } : { keyMappingId };
    },
    {},
  );
  const latest = state.key ?? existing;
  // Hide keys deleted in this session until the page re-renders without them.
  const generated =
    latest && latest.keyMappingId !== deleted.keyMappingId ? latest : undefined;
  const key = generated && {
    ...generated,
    // A regenerated secret belongs to the keys loaded with the page, not newer ones.
    consumerSecret:
      (!state.key && regenerated.consumerSecret) || generated.consumerSecret,
  };
  const error = state.error ?? regenerated.error ?? deleted.error;
  const EnvIcon = LABELS[keyType].icon;

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="icon-tile size-9">
          <EnvIcon aria-hidden className="size-4" strokeWidth={1.6} />
        </span>
        <div className="flex flex-col">
          <h3 className="font-semibold">{LABELS[keyType].label}</h3>
          <span className="text-xs text-muted">{LABELS[keyType].hint}</span>
        </div>
        {key && <span className="badge-success ml-auto">Active</span>}
      </div>

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
          {key.keyMappingId && (
            <AccessToken
              key={key.keyMappingId}
              applicationId={applicationId}
              keyMappingId={key.keyMappingId}
              consumerSecret={key.consumerSecret}
            />
          )}
          {key.keyMappingId && (
            <div className="flex flex-col items-start gap-2 border-t border-border pt-3">
              {confirmingDelete ? (
                <form
                  action={deleteAction}
                  onSubmit={() => setConfirmingDelete(false)}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="keyMappingId" value={key.keyMappingId} />
                  <span className="text-sm">
                    The secret and every access token from these keys stop working at once.
                  </span>
                  <button type="submit" className="button-danger">
                    Delete keys
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <p className="text-xs text-muted">
                    Lost the secret? Delete these keys and generate new ones.
                  </p>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={deleting}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    {deleting ? "Deleting…" : "Delete keys…"}
                  </button>
                </>
              )}
            </div>
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
