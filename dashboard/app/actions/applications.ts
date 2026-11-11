"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backend, BackendError, describeError } from "@/lib/backend";
import { getWso2Token, requireUser } from "@/lib/session";
import type {
  Application,
  ApplicationKey,
  FormState,
  GenerateKeyState,
  KeyType,
} from "@/lib/types";

const NO_WSO2_TOKEN =
  "Save a WSO2 access token in Settings before changing applications.";

/** Explains WSO2 auth failures in terms the user can act on. */
function applicationError(err: unknown): string {
  if (err instanceof BackendError && (err.status === 401 || err.status === 403)) {
    return `WSO2 rejected the request (${err.message}). Your WSO2 token may have expired; save a new one in Settings.`;
  }
  return describeError(err);
}

export async function createApplication(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { token } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const fields = { name, description };

  if (!name) return { error: "Give the application a name.", fields };

  const wso2Token = await getWso2Token();
  if (!wso2Token) return { error: NO_WSO2_TOKEN, fields };

  let application: Application;
  try {
    ({ application } = await backend<{ application: Application }>("/applications", {
      method: "POST",
      body: { name, description },
      token,
      wso2Token,
    }));
  } catch (err) {
    return { error: applicationError(err), fields };
  }

  revalidatePath("/applications");
  redirect(`/applications/${application.id}`);
}

export async function updateApplication(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { token } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const fields = { name, description };

  if (!name) return { error: "The application needs a name.", fields };

  const wso2Token = await getWso2Token();
  if (!wso2Token) return { error: NO_WSO2_TOKEN, fields };

  try {
    await backend(`/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { name, description },
      token,
      wso2Token,
    });
  } catch (err) {
    return { error: applicationError(err), fields };
  }

  revalidatePath("/applications");
  redirect(`/applications/${id}`);
}

export async function deleteApplication(id: string): Promise<FormState> {
  const { token } = await requireUser();
  const wso2Token = await getWso2Token();
  if (!wso2Token) return { error: NO_WSO2_TOKEN };

  try {
    await backend(`/applications/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token,
      wso2Token,
    });
  } catch (err) {
    // Already gone (or never ours): the outcome the user wanted anyway.
    if (!(err instanceof BackendError && err.status === 404)) {
      return { error: applicationError(err) };
    }
  }

  revalidatePath("/applications");
  redirect("/applications");
}

export async function generateKeys(
  id: string,
  keyType: KeyType,
): Promise<GenerateKeyState> {
  const { token } = await requireUser();
  const wso2Token = await getWso2Token();
  if (!wso2Token) return { error: NO_WSO2_TOKEN };

  try {
    const { key } = await backend<{ key: ApplicationKey }>(
      `/applications/${encodeURIComponent(id)}/keys`,
      { method: "POST", body: { keyType }, token, wso2Token },
    );
    // Deliberately no revalidatePath: re-rendering would replace this
    // response, and the secret in it can't be fetched again.
    return { key };
  } catch (err) {
    if (err instanceof BackendError && err.status === 409) {
      return { error: "This application already has keys for that environment." };
    }
    return { error: applicationError(err) };
  }
}
