"use client";

import { useActionState } from "react";
import { saveWso2Token } from "@/app/actions/wso2";

export function Wso2TokenForm() {
  const [state, formAction, pending] = useActionState(saveWso2Token, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && (
        <p role="alert" className="notice-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="notice-info">
          {state.success}
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className="field-label">WSO2 access token</span>
        <textarea
          className="field font-mono text-sm"
          name="token"
          rows={3}
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <button type="submit" className="button-primary self-start" disabled={pending}>
        {pending ? "Saving…" : "Save token"}
      </button>
    </form>
  );
}
