"use client";

import { Bookmark } from "lucide-react";
import { useActionState } from "react";
import { setApiSaved } from "@/app/actions/saved-apis";

export function SaveButton({ apiId, saved }: { apiId: string; saved: boolean }) {
  const [state, formAction, pending] = useActionState(setApiSaved.bind(null, apiId, !saved), {});

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button type="submit" className="button-secondary" aria-pressed={saved} disabled={pending}>
        <Bookmark aria-hidden className={saved ? "size-4 fill-accent text-accent" : "size-4"} />
        {saved ? "Saved" : "Save"}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
