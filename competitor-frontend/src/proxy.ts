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

  let response: NextResponse;
  if (requiresSession && !sessionToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    response = NextResponse.redirect(loginUrl);
  } else {
    response = NextResponse.next();
  }

  // The desktop client announces itself in the URL it opens, which survives
  // exactly one request — the redirect to /login drops the query. Recording it
  // here, on the way past, is what makes the answer available on every later page.
  if (request.nextUrl.searchParams.get("client") === DESKTOP_CLIENT_VALUE) {
    response.cookies.set(DESKTOP_CLIENT_COOKIE, DESKTOP_CLIENT_VALUE, {
      // Read by the sign-out button to decide whether signing out should also stop
      // proctoring. It identifies a window, not a user, and guards nothing.
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
