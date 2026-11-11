"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/lib/types";

interface ApplicationFormProps {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
  /** Starting values when editing an existing application. */
  defaults?: { name: string; description: string };
}

/** Name + description form, shared by the create and edit pages. */
export function ApplicationForm({
  action,
  submitLabel,
  pendingLabel,
  cancelHref,
  defaults,
}: ApplicationFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  // After an error, show what the user typed rather than the original values.
  const values = state.fields ?? defaults;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="notice-error">
          {state.error}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="field-label">Name</span>
        <input
          className="field"
          name="name"
          required
          autoFocus
          defaultValue={values?.name}
        />
        <span className="text-xs text-muted">Must be unique among your WSO2 applications.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="field-label">
          Description <span className="font-normal text-muted">(optional)</span>
        </span>
        <textarea
          className="field"
          name="description"
          rows={3}
          defaultValue={values?.description}
        />
      </label>

      <div className="flex items-center gap-4">
        <button type="submit" className="button-primary" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
        <Link href={cancelHref} className="link">
          Cancel
        </Link>
      </div>
    </form>
  );
}
