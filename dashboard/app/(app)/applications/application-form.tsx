"use client";

import Link from "next/link";
import { useActionState } from "react";
import { formatPolicyLimit } from "@/lib/format";
import type { FormState, ThrottlingPolicy } from "@/lib/types";

interface ApplicationFormProps {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
  /** Starting values when editing an existing application. */
  defaults?: { name: string; description: string; throttlingPolicy?: string };
  /** WSO2 application policies to choose from; the field is hidden when empty. */
  policies?: ThrottlingPolicy[];
}

function policyLabel(policy: ThrottlingPolicy): string {
  const name = policy.displayName ?? policy.name;
  const limit = formatPolicyLimit(policy);
  return limit ? `${name} (${limit})` : name;
}

/** Name + description form, shared by the create and edit pages. */
export function ApplicationForm({
  action,
  submitLabel,
  pendingLabel,
  cancelHref,
  defaults,
  policies = [],
}: ApplicationFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  // After an error, show what the user typed rather than the original values.
  const values = state.fields ?? defaults;
  const selectedPolicy = values?.throttlingPolicy || defaults?.throttlingPolicy || "Unlimited";
  // Keep the current policy selectable even if WSO2 no longer lists it.
  const options = policies.some((p) => p.name === selectedPolicy)
    ? policies
    : [{ name: selectedPolicy }, ...policies];

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

      {policies.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="field-label">Throttling policy</span>
          <select
            className="field"
            name="throttlingPolicy"
            defaultValue={selectedPolicy}
            // Remount after an error so the echoed value is selected.
            key={selectedPolicy}
          >
            {options.map((policy) => (
              <option key={policy.name} value={policy.name}>
                {policyLabel(policy)}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">
            Limits how many requests all of this application&apos;s tokens can make.
          </span>
        </label>
      )}

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
