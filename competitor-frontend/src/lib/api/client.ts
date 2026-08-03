import { API_URL } from "@/lib/auth/constants";

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_URL}${path}`;
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && init?.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
}
