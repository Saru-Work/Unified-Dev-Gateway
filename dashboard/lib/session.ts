import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backend, BackendError } from "./backend";
import type { User } from "./types";

export const SESSION_COOKIE = "opengate_session";
export const WSO2_COOKIE = "opengate_wso2_token";

export const cookieDefaults = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export async function getWso2Token(): Promise<string | undefined> {
  return (await cookies()).get(WSO2_COOKIE)?.value;
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
