import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@mini-algothon/auth";
import { DESKTOP_CLIENT_COOKIE, DESKTOP_CLIENT_VALUE } from "@/lib/desktop";

/** Paths that need a session. `/` and `/login` are matched only to catch the
 *  desktop marker on the way through, and stay reachable signed out. */
const GUARDED_PREFIXES = ["/challenges", "/leaderboard", "/submissions"];

const DESKTOP_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function proxy(request: NextRequest) {
  const requiresSession = GUARDED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const isDesktop =
    request.nextUrl.searchParams.get("client") === DESKTOP_CLIENT_VALUE ||
    request.cookies.get(DESKTOP_CLIENT_COOKIE)?.value === DESKTOP_CLIENT_VALUE;

  let response: NextResponse;
  if (requiresSession && !sessionToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    if (isDesktop) {
      loginUrl.searchParams.set("client", DESKTOP_CLIENT_VALUE);
    }
    response = NextResponse.redirect(loginUrl);
  } else {
    response = NextResponse.next();
  }

  // Record or refresh the desktop client cookie so it survives every navigation.
  if (isDesktop) {
    response.cookies.set(DESKTOP_CLIENT_COOKIE, DESKTOP_CLIENT_VALUE, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: DESKTOP_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/challenges/:path*",
    "/leaderboard/:path*",
    "/submissions/:path*",
  ],
};
