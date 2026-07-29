import { NextResponse, type NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/auth/constants";

// Gate the authenticated portal. Unlike a presence-only check, this asks the
// backend whether the session is actually still valid -- so an expired,
// revoked (logout elsewhere, password reset), or deleted-user session gets a
// real redirect instead of silently rendering a half-authenticated page.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  const res = await fetch(`${API_URL}/api/v1/me`, {
    headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    // The cookie exists but the backend no longer honors it -- clear it so
    // the browser doesn't keep resending a dead token.
    return redirectToLogin(request, { clearCookie: true });
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest, opts?: { clearCookie?: boolean }) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  const response = NextResponse.redirect(url);
  if (opts?.clearCookie) {
    response.cookies.delete(SESSION_COOKIE);
  }
  return response;
}

export const config = {
  matcher: [
    "/challenges/:path*",
    "/leaderboard/:path*",
    "/submissions/:path*",
  ],
};
