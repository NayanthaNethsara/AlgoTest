"use server";

import {
  authenticateUser,
  revokeUserSession,
  fetchSessionUser,
  changeUserPassword,
  SESSION_COOKIE,
  type AuthActionResult,
  type LoginCredentials,
  type SessionUser,
} from "@mini-algothon/auth";

export async function loginAction(
  credentials: LoginCredentials
): Promise<AuthActionResult> {
  return authenticateUser(credentials, "competitor", SESSION_COOKIE);
}

export async function logoutAction(): Promise<void> {
  return revokeUserSession(SESSION_COOKIE);
}

export async function getSessionUserAction(): Promise<SessionUser | null> {
  return fetchSessionUser(SESSION_COOKIE);
}

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  return changeUserPassword(currentPassword, newPassword, SESSION_COOKIE);
}
