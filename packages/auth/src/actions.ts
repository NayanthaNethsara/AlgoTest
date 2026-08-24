"use server";

import { cache } from "react";
import { cookies, headers as incomingHeaders } from "next/headers";
import { API_URL, COOKIE_SECURE, SESSION_COOKIE } from "./constants";
import { clientAddress } from "./client-ip";
import { loginCredentialsSchema, changePasswordSchema } from "./validation";
import type { AuthActionResult, LoginCredentials, SessionUser, UserRole } from "./types";

export async function authenticateUser(
  credentials: LoginCredentials,
  expectedRole?: UserRole,
  cookieName: string = SESSION_COOKIE
): Promise<AuthActionResult> {
  const parsed = loginCredentialsSchema.safeParse(credentials);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || "Invalid credentials" };
  }

  const { username, password } = parsed.data;

  try {
    const headers = new Headers({ "Content-Type": "application/json" });

    // Forward who is actually logging in. The API rate-limits login per IP, and
    // the direct peer here is this server -- so without this every contestant in
    // the hall shares one bucket and the tenth login of the minute is rejected.
    const forwardedFor = clientAddress(await incomingHeaders());
    if (forwardedFor) {
      headers.set("X-Forwarded-For", forwardedFor);
    }

    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers,
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

export async function changeUserPassword(
  currentPassword: string,
  newPassword: string,
  cookieName: string = SESSION_COOKIE
): Promise<{ success: boolean; error?: string }> {
  const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || "Invalid password data" };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(cookieName)?.value;
  if (!sessionToken) {
    return { success: false, error: "Unauthenticated" };
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/me/password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE}=${sessionToken}`,
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || "Failed to update password",
      };
    }

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Password update request failed",
    };
  }
}
