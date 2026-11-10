"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createApplication } from "@/app/actions/applications";

export function CreateApplicationForm() {
  const [state, formAction, pending] = useActionState(createApplication, {});

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
          defaultValue={state.fields?.name}
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
          defaultValue={state.fields?.description}
        />
      </label>

      <div className="flex items-center gap-4">
        <button type="submit" className="button-primary" disabled={pending}>
          {pending ? "Creating…" : "Create application"}
        </button>
        <Link href="/applications" className="link">
          Cancel
        </Link>
      </div>
    </form>
  );
}
