"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, {});

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
        <span className="field-label">Current password</span>
        <input
          className="field"
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">New password</span>
        <input
          className="field"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="text-xs text-muted">At least 8 characters.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="field-label">Confirm new password</span>
        <input
          className="field"
          type="password"
          name="confirm"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <button type="submit" className="button-primary self-start" disabled={pending}>
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
