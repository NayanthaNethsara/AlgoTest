import "server-only";
import zlib from "node:zlib";
import { cookies } from "next/headers";
import { API_URL, ADMIN_SESSION_COOKIE, SESSION_COOKIE, COOKIE_SECURE } from "@mini-algothon/auth";

export { API_URL, ADMIN_SESSION_COOKIE, COOKIE_SECURE };

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (sessionToken) {
    headers.set("Cookie", `${SESSION_COOKIE}=${sessionToken}`);
    headers.set("Authorization", `Bearer ${sessionToken}`);
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

