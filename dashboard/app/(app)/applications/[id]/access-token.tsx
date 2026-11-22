"use client";

import { useActionState } from "react";
import { getAccessToken, type AccessTokenState } from "@/app/actions/applications";
import { CopyButton } from "@/app/copy-button";

interface AccessTokenProps {
  applicationId: string;
  keyMappingId: string;
  /** The secret, when it's still on screen from generating the keys. */
  consumerSecret?: string;
}

/** Gets an access token for calling subscribed APIs through the WSO2 gateway. */
export function AccessToken({ applicationId, keyMappingId, consumerSecret }: AccessTokenProps) {
  const [state, formAction, pending] = useActionState<AccessTokenState, FormData>(
    getAccessToken.bind(null, applicationId, keyMappingId),
    {},
  );

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-xs font-medium text-muted">Access token</span>

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        {consumerSecret ? (
          <input type="hidden" name="consumerSecret" value={consumerSecret} />
        ) : (
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="field-label">Consumer secret</span>
            <input
              type="password"
              name="consumerSecret"
              required
              autoComplete="off"
              className="field"
              placeholder="Paste the secret for these keys"
            />
          </label>
        )}
        <button type="submit" className="button-secondary" disabled={pending}>
          {pending ? "Getting token…" : state.accessToken ? "Get a new token" : "Get access token"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="notice-error">
          {state.error}
        </p>
      )}

      {state.accessToken && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <code className="max-h-24 min-w-0 flex-1 overflow-y-auto break-all rounded-md bg-surface px-2 py-1 font-mono text-xs">
              {state.accessToken}
            </code>
            <CopyButton value={state.accessToken} />
          </div>
          <p className="text-xs text-muted">
            Send it as <code className="font-mono">Authorization: Bearer &lt;token&gt;</code> to
            the API&apos;s gateway URL. It expires in {Math.round((state.expiresIn ?? 3600) / 60)}{" "}
            minutes.
          </p>
        </div>
      )}
    </div>
  );
}
