import "server-only";
import { cookies, headers as incomingHeaders } from "next/headers";
import { clientAddress } from "@mini-algothon/auth";
import { API_URL, SESSION_COOKIE } from "@/lib/auth/constants";
import {
  CLIENT_HEADER,
  DESKTOP_CLIENT_COOKIE,
  DESKTOP_CLIENT_VALUE,
  WEB_CLIENT_VALUE,
} from "@/lib/desktop";

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

  // Which window this request came from, forwarded on every call rather than only
  // on submit: the API decides submission access from it, and the status poll has to
  // answer for the same window the contestant is actually looking at — otherwise
  // someone in a browser is told they are fine right up until they submit.
  const desktop =
    cookieStore.get(DESKTOP_CLIENT_COOKIE)?.value === DESKTOP_CLIENT_VALUE;
  headers.set(CLIENT_HEADER, desktop ? DESKTOP_CLIENT_VALUE : WEB_CLIENT_VALUE);

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
