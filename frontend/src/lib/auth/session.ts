import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE, type SessionUser } from "@/lib/auth/constants";

// getSessionUser resolves the current user by having the backend verify the
// session cookie. Cached per request so multiple components share one call.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return null;

  const res = await fetch(`${API_URL}/api/v1/me`, {
    headers: { Cookie: `${SESSION_COOKIE}=${session}` },
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json();
});
