"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backend, BackendError, describeError } from "@/lib/backend";
import { requireUser } from "@/lib/session";
import type {
  Application,
  ApplicationKey,
  FormState,
  GenerateKeyState,
  KeyType,
} from "@/lib/types";

/** Explains WSO2 auth failures in terms the user can act on. */
function applicationError(err: unknown): string {
  if (err instanceof BackendError && (err.status === 401 || err.status === 403)) {
    return `WSO2 rejected the request (${err.message}). Ask an administrator to check OpenGate's WSO2 account.`;
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
  const throttlingPolicy = String(formData.get("throttlingPolicy") ?? "").trim();
  const fields = { name, description, throttlingPolicy };

  if (!name) return { error: "Give the application a name.", fields };


  let application: Application;
  try {
    ({ application } = await backend<{ application: Application }>("/applications", {
      method: "POST",
      body: { name, description, ...(throttlingPolicy && { throttlingPolicy }) },
      token,
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
  const throttlingPolicy = String(formData.get("throttlingPolicy") ?? "").trim();
  const fields = { name, description, throttlingPolicy };

  if (!name) return { error: "The application needs a name.", fields };


  try {
    await backend(`/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { name, description, ...(throttlingPolicy && { throttlingPolicy }) },
      token,
    });
  } catch (err) {
    return { error: applicationError(err), fields };
  }

  revalidatePath("/applications");
  redirect(`/applications/${id}`);
}

export async function deleteApplication(id: string): Promise<FormState> {
  const { token } = await requireUser();
  try {
    await backend(`/applications/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token,
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
  try {
    const { key } = await backend<{ key: ApplicationKey }>(
      `/applications/${encodeURIComponent(id)}/keys`,
      { method: "POST", body: { keyType }, token },
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

export async function unsubscribe(
  applicationId: string,
  subscriptionId: string,
): Promise<FormState> {
  const { token } = await requireUser();
  try {
    await backend(
      `/applications/${encodeURIComponent(applicationId)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "DELETE", token },
    );
  } catch (err) {
    return { error: applicationError(err) };
  }

  revalidatePath(`/applications/${applicationId}`);
  return {};
}

export async function subscribe(
  apiId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { token } = await requireUser();
  const applicationId = String(formData.get("applicationId") ?? "");
  const throttlingPolicy = String(formData.get("throttlingPolicy") ?? "");
  const fields = { applicationId, throttlingPolicy };

  if (!applicationId) return { error: "Choose an application.", fields };
  if (!throttlingPolicy) return { error: "Choose a tier.", fields };


  try {
    await backend(`/applications/${encodeURIComponent(applicationId)}/subscriptions`, {
      method: "POST",
      body: { apiId, throttlingPolicy },
      token,
    });
  } catch (err) {
    if (err instanceof BackendError && err.status === 409) {
      return { error: "That application is already subscribed to this API.", fields };
    }
    return { error: applicationError(err), fields };
  }

  revalidatePath(`/applications/${applicationId}`);
  redirect(`/applications/${applicationId}`);
}

export async function regenerateSecret(
  id: string,
  keyMappingId: string,
): Promise<{ error?: string; consumerSecret?: string }> {
  const { token } = await requireUser();
  try {
    const { key } = await backend<{ key: { consumerSecret: string } }>(
      `/applications/${encodeURIComponent(id)}/keys/${encodeURIComponent(keyMappingId)}/regenerate-secret`,
      { method: "POST", token },
    );
    // As with generateKeys: no revalidation, so the one-time secret stays visible.
    return { consumerSecret: key.consumerSecret };
  } catch (err) {
    return { error: applicationError(err) };
  }
}

export interface AccessTokenState {
  error?: string;
  accessToken?: string;
  expiresIn?: number;
}

/**
 * Swaps an app's consumer key and secret for an access token, so the user
 * doesn't have to call WSO2's token endpoint. The secret comes from the form,
 * since OpenGate never stores it.
 */
export async function getAccessToken(
  id: string,
  keyMappingId: string,
  _prev: AccessTokenState,
  formData: FormData,
): Promise<AccessTokenState> {
  const { token } = await requireUser();
  const consumerSecret = String(formData.get("consumerSecret") ?? "").trim();
  if (!consumerSecret) return { error: "Enter the consumer secret for these keys." };

  try {
    const { token: accessToken } = await backend<{
      token: { accessToken: string; expiresIn: number };
    }>(
      `/applications/${encodeURIComponent(id)}/keys/${encodeURIComponent(keyMappingId)}/token`,
      { method: "POST", body: { consumerSecret }, token },
    );
    // No revalidation: the token lives only in this response.
    return { accessToken: accessToken.accessToken, expiresIn: accessToken.expiresIn };
  } catch (err) {
    if (err instanceof BackendError && err.status === 400) {
      return { error: "That consumer secret doesn't match these keys." };
    }
    return { error: applicationError(err) };
  }
}

/** Deletes one environment's keys so the user can generate new ones. */
export async function deleteKeys(id: string, keyMappingId: string): Promise<FormState> {
  const { token } = await requireUser();
  try {
    await backend(
      `/applications/${encodeURIComponent(id)}/keys/${encodeURIComponent(keyMappingId)}`,
      { method: "DELETE", token },
    );
  } catch (err) {
    // Already gone: the outcome the user wanted anyway.
    if (!(err instanceof BackendError && err.status === 404)) {
      return { error: applicationError(err) };
    }
  }
  revalidatePath(`/applications/${id}`);
  return { success: "Keys deleted." };
}
