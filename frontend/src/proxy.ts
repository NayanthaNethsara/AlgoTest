import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Gate the authenticated portal: no session cookie -> send to /login.
// This is a cheap presence check for UX; the backend still verifies the
// cookie on every data request.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/challenges/:path*",
    "/leaderboard/:path*",
    "/submissions/:path*",
    "/admin/:path*",
  ],
};
