import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@mini-algothon/auth";

export function proxy(request: NextRequest) {
  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (session) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/",
    "/problems/:path*",
    "/teams/:path*",
    "/users/:path*",
    "/submissions/:path*",
    "/monitoring/:path*",
    "/timer",
    "/timer/:path*",
  ],
};
