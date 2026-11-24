"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backend, BackendError, describeError } from "@/lib/backend";
import {
  clientIp,
  requireUser,
  sessionCookieOptions,
  REFRESH_COOKIE,
  SESSION_COOKIE,
} from "@/lib/session";
import { storeSession } from "@/lib/session-cookies";
import type { FormState, LoginResponse } from "@/lib/types";

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

function tooMany(err: unknown): string | undefined {
  return err instanceof BackendError && err.status === 429
    ? "Too many attempts. Wait a few minutes and try again."
    : undefined;
}

/** Only allow same-site relative paths, so `next` can't redirect off-site. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

async function startSession(email: string, password: string) {
  const session = await backend<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    clientIp: await clientIp(),
  });
  storeSession(await cookies(), session, await sessionCookieOptions());
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
        : tooMany(err) ?? describeError(err);
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
    await backend("/auth/register", {
      method: "POST",
      body: { email, password },
      clientIp: await clientIp(),
    });
    await startSession(email, password);
  } catch (err) {
    const error =
      err instanceof BackendError && err.status === 409
        ? "An account with that email already exists."
        : tooMany(err) ?? describeError(err);
    return { error, fields: { email } };
  }

  redirect("/dashboard");
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
      // Keeps this session signed in; every other one is signed out.
      body: {
        currentPassword,
        newPassword,
        refreshToken: (await cookies()).get(REFRESH_COOKIE)?.value,
      },
      token,
      clientIp: await clientIp(),
    });
  } catch (err) {
    if (err instanceof BackendError && err.status === 403) {
      return { error: "Your current password is incorrect." };
    }
    const limited = tooMany(err);
    if (limited) return { error: limited };
    return { error: describeError(err) };
  }

  return {
    success: "Password changed. Other devices are signed out within 15 minutes.",
  };
}

export async function logout() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    // End the session on the backend too, so a copied cookie stops working.
    // Signing out locally still happens if the backend can't be reached.
    await backend("/auth/logout", {
      method: "POST",
      body: { refreshToken },
      clientIp: await clientIp(),
    }).catch(() => undefined);
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect("/login");
}
