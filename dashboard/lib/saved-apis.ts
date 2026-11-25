import { cache } from "react";
import { backend } from "./backend";
import { requireUser } from "./session";

/** Ids of the APIs the signed-in user saved. Empty if they can't be loaded. */
export const loadSavedApis = cache(async (): Promise<Set<string>> => {
  const { token } = await requireUser();
  try {
    const { apis } = await backend<{ apis: { apiId: string }[] }>("/saved-apis", { token });
    return new Set(apis.map((a) => a.apiId));
  } catch {
    return new Set();
  }
});
