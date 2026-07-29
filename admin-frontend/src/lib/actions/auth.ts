"use server";

import { cookies } from "next/headers";
import { backendFetch, ADMIN_SESSION_COOKIE, COOKIE_SECURE } from "@/lib/api/server";
import type { User } from "@/types/user";

export async function loginAction(username: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> {
  try {
    const res = await backendFetch("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { success: false, error: errBody.error || "Invalid username or password" };
    }

    const data = await res.json();
    const user: User = data.user;

    if (user.role !== "admin") {
      return { success: false, error: "Access denied: Admin role required." };
    }

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE, data.sessionToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      maxAge: data.expiresInSeconds || 604800,
    });

    return { success: true, user };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Authentication failed" };
  }
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (token) {
    await backendFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    cookieStore.delete(ADMIN_SESSION_COOKIE);
  }
}

export async function getSessionUserAction(): Promise<User | null> {
  try {
    const res = await backendFetch("/api/v1/me");
    if (!res.ok) return null;
    const user: User = await res.json();
    if (user.role !== "admin") return null;
    return user;
  } catch {
    return null;
  }
}
