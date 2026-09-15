import "server-only";
import zlib from "node:zlib";
import { cookies, headers as incomingHeaders } from "next/headers";
import {
  API_URL,
  ADMIN_SESSION_COOKIE,
  SESSION_COOKIE,
  COOKIE_SECURE,
  clientAddress,
} from "@mini-algothon/auth";

export { API_URL, ADMIN_SESSION_COOKIE, COOKIE_SECURE };

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    incomingHeaders().catch(() => null),
  ]);
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (sessionToken) {
    headers.set("Cookie", `${SESSION_COOKIE}=${sessionToken}`);
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  if (requestHeaders) {
    const forwardedFor = clientAddress(requestHeaders);
    if (forwardedFor) {
      headers.set("X-Forwarded-For", forwardedFor);
    }
    const userAgent = requestHeaders.get("user-agent");
    if (userAgent) {
      headers.set("User-Agent", userAgent);
    }
  }

  let body = init?.body;
  if (typeof body === "string" && body.length > 128 * 1024) {
    const compressed = zlib.gzipSync(Buffer.from(body, "utf-8"));
    headers.set("Content-Encoding", "gzip");
    body = compressed;
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    body,
    headers,
    cache: "no-store",
  });
}

