import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL, COOKIE_SECURE, SESSION_COOKIE } from "@/lib/auth/constants";

// POST: log in with username + password. The backend verifies credentials and
// returns an opaque session token, which we store in an HTTP-only cookie.
export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: "missing credentials" }, { status: 400 });
  }

  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "invalid username or password" }, { status: 401 });
  }

  const data = await res.json();
  const store = await cookies();
  store.set(SESSION_COOKIE, data.sessionToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: data.expiresInSeconds,
  });

  return NextResponse.json({ user: data.user });
}

// DELETE: revoke the session on the backend and clear the cookie.
export async function DELETE() {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE)?.value;

  if (session) {
    await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Cookie: `${SESSION_COOKIE}=${session}` },
    }).catch(() => {});
    store.delete(SESSION_COOKIE);
  }

  return NextResponse.json({ ok: true });
}
