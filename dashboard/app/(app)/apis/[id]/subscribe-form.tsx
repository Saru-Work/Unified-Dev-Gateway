"use client";

import { useActionState } from "react";
import { subscribe } from "@/app/actions/applications";

interface SubscribeFormProps {
  apiId: string;
  applications: { id: string; name: string }[];
  tiers: string[];
}

export function SubscribeForm({ apiId, applications, tiers }: SubscribeFormProps) {
  const [state, formAction, pending] = useActionState(subscribe.bind(null, apiId), {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && (
        <p role="alert" className="notice-error">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="field-label">Application</span>
          <select
            className="field"
            name="applicationId"
            required
            defaultValue={state.fields?.applicationId ?? applications[0]?.id}
          >
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-36 flex-col gap-1">
          <span className="field-label">Tier</span>
          <select
            className="field"
            name="throttlingPolicy"
            required
            defaultValue={state.fields?.throttlingPolicy ?? tiers[0]}
          >
            {tiers.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button-primary" disabled={pending}>
          {pending ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
    </form>
  );
}
