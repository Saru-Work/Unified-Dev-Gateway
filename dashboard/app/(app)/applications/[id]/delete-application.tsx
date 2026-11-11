"use client";

import { useActionState, useState } from "react";
import { deleteApplication } from "@/app/actions/applications";

export function DeleteApplication({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(deleteApplication.bind(null, id), {});

  return (
    <section className="card flex flex-col items-start gap-3 border-danger">
      <div>
        <h2 className="font-semibold">Delete application</h2>
        <p className="text-sm text-muted">
          Removes it from WSO2 API Manager as well. Anything using its
          credentials will stop working. This can&apos;t be undone.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="notice-error">
          {state.error}
        </p>
      )}

      {confirming ? (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <span className="text-sm">
            Delete <strong>{name}</strong>?
          </span>
          <button type="submit" className="button-danger" disabled={pending}>
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="button-danger" onClick={() => setConfirming(true)}>
          Delete…
        </button>
      )}
    </section>
  );
}
