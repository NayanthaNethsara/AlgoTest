"use server";

import {
  authenticateUser,
  revokeUserSession,
  fetchSessionUser,
  changeUserPassword,
  ADMIN_SESSION_COOKIE,
  type SessionUser,
} from "@mini-algothon/auth";

export async function loginAction(username: string, password: string) {
  return authenticateUser({ username, password }, "admin", ADMIN_SESSION_COOKIE);
}

export async function logoutAction(): Promise<void> {
  return revokeUserSession(ADMIN_SESSION_COOKIE);
}

export async function getSessionUserAction(): Promise<SessionUser | null> {
  const user = await fetchSessionUser(ADMIN_SESSION_COOKIE);
  if (!user || user.role !== "admin") {
    return null;
  }
  return user;
}

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  return changeUserPassword(currentPassword, newPassword, ADMIN_SESSION_COOKIE);
}

export async function getAdminUploadConfigAction(): Promise<{ token: string; apiUrl: string } | null> {
  const user = await getSessionUserAction();
  if (!user) return null;

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:8080";
  return { token, apiUrl };
}

