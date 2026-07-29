export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  return res;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `HTTP error ${res.status}`);
  }
  return res.json();
}
