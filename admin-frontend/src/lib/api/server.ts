import "server-only";
import { cookies } from "next/headers";

export const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const ADMIN_SESSION_COOKIE = "admin_session";
export const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (sessionToken) {
    headers.set("Cookie", `session=${sessionToken}`);
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
