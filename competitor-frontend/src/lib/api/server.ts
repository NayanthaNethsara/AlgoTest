import "server-only";
import { cookies, headers as incomingHeaders } from "next/headers";
import { API_URL, SESSION_COOKIE } from "@/lib/auth/constants";

// backendFetch calls the Go backend from the server, forwarding the session
// cookie so protected routes see the authenticated user.
export async function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    incomingHeaders(),
  ]);

  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const headers = new Headers(init?.headers);
  if (session) {
    headers.set("Cookie", `${SESSION_COOKIE}=${session}`);
    headers.set("Authorization", `Bearer ${session}`);
  }

  const forwardedFor = clientAddress(requestHeaders);
  if (forwardedFor) {
    headers.set("X-Forwarded-For", forwardedFor);
  }
  const userAgent = requestHeaders.get("user-agent");
  if (userAgent) {
    headers.set("User-Agent", userAgent);
  }

  return fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
}

function clientAddress(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return requestHeaders.get("x-real-ip")?.trim() ?? "";
}
