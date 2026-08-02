import "server-only";
import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "@/lib/auth/constants";

// backendFetch calls the Go backend from the server, forwarding the session
// cookie so protected routes see the authenticated user.
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  const headers = new Headers(init?.headers);
  if (session) {
    headers.set("Cookie", `${SESSION_COOKIE}=${session}`);
    headers.set("Authorization", `Bearer ${session}`);
  }
  return fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
}
