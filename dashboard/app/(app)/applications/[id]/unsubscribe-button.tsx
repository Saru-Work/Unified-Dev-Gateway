"use client";

import { useActionState } from "react";
import { unsubscribe } from "@/app/actions/applications";

export function UnsubscribeButton({
  applicationId,
  subscriptionId,
  apiName,
}: {
  applicationId: string;
  subscriptionId: string;
  apiName: string;
}) {
  const [state, formAction, pending] = useActionState(
    unsubscribe.bind(null, applicationId, subscriptionId),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        className="button-secondary"
        disabled={pending}
        aria-label={`Unsubscribe from ${apiName}`}
      >
        {pending ? "Removing…" : "Unsubscribe"}
      </button>
      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
