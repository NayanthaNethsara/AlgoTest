import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@mini-algothon/auth";

export function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/challenges/:path*",
    "/leaderboard/:path*",
    "/submissions/:path*",
  ],
};
