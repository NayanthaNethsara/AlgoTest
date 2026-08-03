export const SESSION_COOKIE = "session";
export const ADMIN_SESSION_COOKIE = "admin_session";

export const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
