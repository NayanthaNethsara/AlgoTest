"use server";

import { cache } from "react";
import { cookies } from "next/headers";
import { API_URL, COOKIE_SECURE, SESSION_COOKIE } from "./constants";
import type { AuthActionResult, LoginCredentials, SessionUser, UserRole } from "./types";

export async function authenticateUser(
  credentials: LoginCredentials,
  expectedRole?: UserRole,
  cookieName: string = SESSION_COOKIE
): Promise<AuthActionResult> {
  const { username, password } = credentials;
  if (!username || !password) {
    return { success: false, error: "Username and password are required" };
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || "Invalid username or password",
      };
    }

    const responseData = await response.json();
    const authenticatedUser: SessionUser = responseData.user;

    if (expectedRole && authenticatedUser.role !== expectedRole) {
      return {
        success: false,
        error: `Access denied: ${expectedRole} role required`,
      };
    }

    const cookieStore = await cookies();
    cookieStore.set(cookieName, responseData.sessionToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      maxAge: responseData.expiresInSeconds || 604800,
    });

    return { success: true, user: authenticatedUser };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Authentication request failed",
    };
  }
}

export async function revokeUserSession(cookieName: string = SESSION_COOKIE): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(cookieName)?.value;

  if (sessionToken) {
    try {
      await fetch(`${API_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE}=${sessionToken}`,
          Authorization: `Bearer ${sessionToken}`,
        },
        cache: "no-store",
      });
    } catch {
      // Ignore network errors on logout cleanup
    }
    cookieStore.delete(cookieName);
  }
}

export const fetchSessionUser = cache(
  async (cookieName: string = SESSION_COOKIE): Promise<SessionUser | null> => {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(cookieName)?.value;

    if (!sessionToken) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/me`, {
        headers: {
          Cookie: `${SESSION_COOKIE}=${sessionToken}`,
          Authorization: `Bearer ${sessionToken}`,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }
);
