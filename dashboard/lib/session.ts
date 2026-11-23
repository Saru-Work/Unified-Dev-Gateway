import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { backend, BackendError } from "./backend";
import type { User } from "./types";

export const SESSION_COOKIE = "opengate_session";

/**
 * Options for the session cookie. It's `Secure` whenever the visitor came in
 * over HTTPS (nginx sets X-Forwarded-Proto), so a production build still works
 * on plain http://localhost, where browsers may drop a Secure cookie.
 */
export async function sessionCookieOptions() {
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https" || process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
  } as const;
}

/**
 * The visitor's address as the reverse proxy saw it (nginx sets X-Real-IP),
 * to forward to the backend so its rate limits count visitors separately
 * rather than lumping everyone together as "the dashboard".
 */
export async function clientIp(): Promise<string | undefined> {
  return (await headers()).get("x-real-ip")?.trim() || undefined;
}

/**
 * Returns the signed-in user and their token, or redirects to /login.
 * Verified against the backend (not just "a cookie exists"), and cached so
 * a layout and page in the same request share one /auth/me call.
 */
export const requireUser = cache(
  async (): Promise<{ user: User; token: string }> => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) redirect("/login");

    try {
      const { user } = await backend<{ user: User }>("/auth/me", { token });
      return { user, token };
    } catch (err) {
      if (err instanceof BackendError && (err.status === 401 || err.status === 404)) {
        redirect("/login?expired=1");
      }
      throw err;
    }
  },
);
