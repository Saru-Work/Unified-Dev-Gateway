"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/types";

interface AuthFormProps {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel: string;
  /** Show a "confirm password" field (registration). */
  confirm?: boolean;
  /** Where to go after signing in. */
  next?: string;
}

export function AuthForm({ action, submitLabel, pendingLabel, confirm, next }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const passwordAutocomplete = confirm ? "new-password" : "current-password";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && (
        <p role="alert" className="notice-error">
          {state.error}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="field-label">Email</span>
        <input
          className="field"
          type="email"
          name="email"
          autoComplete="email"
          required
          defaultValue={state.fields?.email}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="field-label">Password</span>
        <input
          className="field"
          type="password"
          name="password"
          autoComplete={passwordAutocomplete}
          minLength={confirm ? 8 : undefined}
          required
        />
        {confirm && <span className="text-xs text-muted">At least 8 characters.</span>}
      </label>

      {confirm && (
        <label className="flex flex-col gap-1">
          <span className="field-label">Confirm password</span>
          <input
            className="field"
            type="password"
            name="confirm"
            autoComplete="new-password"
            required
          />
        </label>
      )}

      <button type="submit" className="button-primary" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
