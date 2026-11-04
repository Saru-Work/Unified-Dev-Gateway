import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only: no session cookie means "not signed in", so skip
// rendering and go to /login. The token itself is verified by requireUser()
// in the (app) layout.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("opengate_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

// Only signed-in areas are matched. "/" stays public (it must render even
// before /login exists, and it's where signed-out visitors land).
export const config = {
  matcher: ["/applications/:path*", "/apis/:path*"],
};
