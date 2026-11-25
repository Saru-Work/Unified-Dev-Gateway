import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BackendError } from "@/lib/backend";
import {
  cookieOptions,
  needsRefresh,
  refreshSession,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  storeSession,
} from "@/lib/session-cookies";

function toLogin(request: NextRequest, expired: boolean) {
  const login = new URL("/login", request.url);
  if (expired) login.searchParams.set("expired", "1");
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

// Keeps the session alive: when the access token is missing or about to
// expire, swap the refresh token for a new pair before the page renders.
// Pages can't set cookies, so this is the one place that can. The token is
// still verified by requireUser() in the (app) layout.
export async function proxy(request: NextRequest) {
  const access = request.cookies.get(SESSION_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    // Signed in before refresh tokens existed: keep going until the access token lapses.
    return access ? NextResponse.next() : toLogin(request, false);
  }
  if (!needsRefresh(access)) return NextResponse.next();

  let session;
  try {
    session = await refreshSession(
      refreshToken,
      request.headers.get("x-real-ip")?.trim() || undefined,
    );
  } catch (err) {
    if (err instanceof BackendError && err.status === 401) {
      const res = toLogin(request, true);
      res.cookies.delete(SESSION_COOKIE);
      res.cookies.delete(REFRESH_COOKIE);
      return res;
    }
    // Backend unreachable or erroring: let the page show its own error rather
    // than signing the user out over an outage.
    return NextResponse.next();
  }

  // Hand the new token to this request's Server Components and Actions...
  request.cookies.set(SESSION_COOKIE, session.accessToken);
  request.cookies.set(REFRESH_COOKIE, session.refreshToken);
  const res = NextResponse.next({ request: { headers: request.headers } });
  // ...and to the browser for the next one.
  storeSession(res.cookies, session, cookieOptions(request.headers.get("x-forwarded-proto")));
  return res;
}

// Only signed-in areas are matched. "/" stays public: it's where signed-out
// visitors land.
export const config = {
  matcher: ["/dashboard/:path*", "/applications/:path*", "/apis/:path*", "/settings/:path*", "/usage/:path*", "/usage-export"],
};
