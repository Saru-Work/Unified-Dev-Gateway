// Session cookies, shared by proxy.ts and Server Actions. No next/headers
// here, so the proxy can import it.

import { backend } from "./backend";
import type { LoginResponse } from "./types";

/** The 15-minute OpenGate access token (a JWT). */
export const SESSION_COOKIE = "opengate_session";
/** The 30-day, single-use refresh token that gets a new access token. */
export const REFRESH_COOKIE = "opengate_refresh";

/** Refresh when the access token has less than this left, so a page never renders with one about to lapse. */
const REFRESH_MARGIN_SECONDS = 60;

/**
 * Options for both cookies. They're `Secure` whenever the visitor came in over
 * HTTPS (nginx sets X-Forwarded-Proto), so a production build still works on
 * plain http://localhost, where browsers may drop a Secure cookie.
 */
export function cookieOptions(forwardedProto: string | null | undefined) {
  const proto = forwardedProto?.split(",")[0]?.trim();
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https" || process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
  } as const;
}

type Options = ReturnType<typeof cookieOptions>;

/** Something with a Next.js cookie `set` (ResponseCookies, or cookies() in an action). */
interface CookieSetter {
  set(name: string, value: string, options: Options & { maxAge: number }): unknown;
}

/** Stores both tokens from a /auth/login or /auth/refresh response. */
export function storeSession(jar: CookieSetter, session: LoginResponse, options: Options) {
  jar.set(SESSION_COOKIE, session.accessToken, { ...options, maxAge: session.expiresIn });
  jar.set(REFRESH_COOKIE, session.refreshToken, { ...options, maxAge: session.refreshExpiresIn });
}

/**
 * Whether an access token is missing, unreadable or about to expire. It only
 * reads the `exp` claim and doesn't check the signature: the backend does
 * that on every call, so a forged token gets nowhere.
 */
export function needsRefresh(accessToken: string | undefined, nowMs = Date.now()): boolean {
  if (!accessToken) return true;
  const payload = accessToken.split(".")[1];
  if (!payload) return true;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof exp !== "number" || exp * 1000 - nowMs < REFRESH_MARGIN_SECONDS * 1000;
  } catch {
    return true;
  }
}

/** Swaps a refresh token for a new session. Throws BackendError (401 when it's no longer valid). */
export function refreshSession(refreshToken: string, clientIp?: string): Promise<LoginResponse> {
  return backend<LoginResponse>("/auth/refresh", {
    method: "POST",
    body: { refreshToken },
    clientIp,
  });
}
