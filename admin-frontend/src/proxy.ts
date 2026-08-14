import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@mini-algothon/auth";

// Presence of the cookie only. Whether it belongs to an admin is decided by the
// API, which gates every /admin route on requireAdmin -- this just stops the
// console rendering for someone who is not signed in at all.
export function proxy(request: NextRequest) {
  if (request.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/", "/problems/:path*", "/teams/:path*", "/users/:path*", "/submissions/:path*", "/monitoring/:path*"],
};
