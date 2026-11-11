"use server";

import { cookies } from "next/headers";
import { cookieDefaults, requireUser, WSO2_COOKIE } from "@/lib/session";
import type { FormState } from "@/lib/types";

// WSO2 access tokens default to a one-hour lifetime; don't keep ours longer.
const WSO2_TOKEN_MAX_AGE = 60 * 60;

export async function saveWso2Token(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  // Accept the token with or without a "Bearer " prefix.
  const token = String(formData.get("token") ?? "")
    .trim()
    .replace(/^bearer\s+/i, "");
  if (!token) return { error: "Paste a WSO2 access token." };
  if (/\s/.test(token)) return { error: "The token shouldn't contain spaces." };

  (await cookies()).set(WSO2_COOKIE, token, {
    ...cookieDefaults,
    maxAge: WSO2_TOKEN_MAX_AGE,
  });
  return { success: "WSO2 token saved for the next hour." };
}

export async function clearWso2Token(): Promise<void> {
  await requireUser();
  (await cookies()).delete(WSO2_COOKIE);
}
