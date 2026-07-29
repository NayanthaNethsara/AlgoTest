// Must match the backend's SESSION_COOKIE_NAME.
export const SESSION_COOKIE = "session";

// Server-only base URL for the Go backend (never exposed to the browser).
export const API_URL = process.env.API_URL ?? "http://localhost:8080";

// Set true only when served over HTTPS. On an offline HTTP LAN keep it false,
// otherwise the browser won't send the cookie back.
export const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  lastLoginAt?: string;
};
