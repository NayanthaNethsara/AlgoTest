"use server";

import { backendFetch } from "@/lib/api/server";
import type { User, CreateUserInput, BulkResult } from "@/types/user";

export async function listUsersAction(): Promise<User[]> {
  const res = await backendFetch("/api/v1/admin/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  const data = await res.json();
  return data.users || [];
}

export async function createUserAction(input: CreateUserInput): Promise<{ user: User; password?: string }> {
  const res = await backendFetch("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to create user");
  }
  return res.json();
}

export async function bulkCreateUsersAction(
  role: string,
  users: CreateUserInput[]
): Promise<{ results: BulkResult[] }> {
  const res = await backendFetch("/api/v1/admin/users/bulk", {
    method: "POST",
    body: JSON.stringify({ role, users }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Bulk import failed");
  }
  return res.json();
}

export async function resetPasswordAction(userId: string): Promise<{ password: string }> {
  const res = await backendFetch(`/api/v1/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to reset password");
  }
  return res.json();
}

export async function updateRoleAction(userId: string, role: string): Promise<void> {
  const res = await backendFetch(`/api/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to update role");
  }
}

export async function deleteUserAction(userId: string): Promise<void> {
  const res = await backendFetch(`/api/v1/admin/users/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to delete user");
  }
}
