import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { backend, BackendError } from "./backend";
import { cookieOptions, REFRESH_COOKIE, SESSION_COOKIE } from "./session-cookies";
import type { User } from "./types";

export { REFRESH_COOKIE, SESSION_COOKIE } from "./session-cookies";

/** Cookie options for this request (Secure when the visitor came over HTTPS). */
export async function sessionCookieOptions() {
  return cookieOptions((await headers()).get("x-forwarded-proto"));
}

/** Whether the visitor has a session, even one whose access token needs refreshing. */
export async function hasSession(): Promise<boolean> {
  const jar = await cookies();
  return jar.has(SESSION_COOKIE) || jar.has(REFRESH_COOKIE);
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
