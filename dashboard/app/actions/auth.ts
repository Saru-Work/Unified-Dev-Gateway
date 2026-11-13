"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backend, BackendError, describeError } from "@/lib/backend";
import { cookieDefaults, requireUser, SESSION_COOKIE, WSO2_COOKIE } from "@/lib/session";
import type { FormState, LoginResponse } from "@/lib/types";

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

/** Only allow same-site relative paths, so `next` can't redirect off-site. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/applications";
}

async function startSession(email: string, password: string) {
  const { accessToken, expiresIn } = await backend<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  (await cookies()).set(SESSION_COOKIE, accessToken, {
    ...cookieDefaults,
    maxAge: expiresIn,
  });
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) {
    return { error: "Enter your email and password.", fields: { email } };
  }

  try {
    await startSession(email, password);
  } catch (err) {
    const error =
      err instanceof BackendError && err.status === 401
        ? "Incorrect email or password."
        : describeError(err);
    return { error, fields: { email } };
  }

  redirect(safeNext(formData.get("next")));
}

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email, password } = readCredentials(formData);
  const confirm = String(formData.get("confirm") ?? "");

  if (!email) return { error: "Enter your email.", fields: { email } };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", fields: { email } };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match.", fields: { email } };
  }

  try {
    await backend("/auth/register", { method: "POST", body: { email, password } });
    await startSession(email, password);
  } catch (err) {
    const error =
      err instanceof BackendError && err.status === 409
        ? "An account with that email already exists."
        : describeError(err);
    return { error, fields: { email } };
  }

  redirect("/applications");
}

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { token } = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!currentPassword) return { error: "Enter your current password." };
  if (newPassword.length < 8) return { error: "New password must be at least 8 characters." };
  if (newPassword !== confirm) return { error: "New passwords don't match." };

  try {
    await backend("/auth/password", {
      method: "POST",
      body: { currentPassword, newPassword },
      token,
    });
  } catch (err) {
    if (err instanceof BackendError && err.status === 403) {
      return { error: "Your current password is incorrect." };
    }
    if (err instanceof BackendError && err.status === 429) {
      return { error: "Too many attempts. Wait a few minutes and try again." };
    }
    return { error: describeError(err) };
  }

  return { success: "Password changed. Use it the next time you sign in." };
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(WSO2_COOKIE);
  redirect("/login");
}
