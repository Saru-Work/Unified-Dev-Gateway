"use server";

import { revalidatePath } from "next/cache";
import { backend, describeError } from "@/lib/backend";
import { requireUser } from "@/lib/session";
import type { FormState } from "@/lib/types";

export async function setApiSaved(apiId: string, saved: boolean): Promise<FormState> {
  const { token } = await requireUser();
  try {
    await backend(`/saved-apis/${encodeURIComponent(apiId)}`, { method: saved ? "PUT" : "DELETE", token });
  } catch (err) {
    return { error: describeError(err) };
  }
  revalidatePath("/apis", "layout");
  return {};
}
