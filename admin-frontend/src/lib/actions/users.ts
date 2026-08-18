"use server";

import { backendFetch } from "@/lib/api/server";
import type { User, CreateUserInput, BulkResult } from "@/types/user";

export async function listUsersAction(): Promise<User[]> {
  try {
    const res = await backendFetch("/api/v1/admin/users");
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to fetch users");
    }
    const data = await res.json();
    return data.users || [];
  } catch (err: any) {
    throw new Error(err.message || "Failed to fetch users");
  }
}

export async function createUserAction(
  input: CreateUserInput
): Promise<{ user: User; password?: string }> {
  try {
    const res = await backendFetch("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to create user");
    }
    return await res.json();
  } catch (err: any) {
    throw new Error(err.message || "Failed to create user");
  }
}

export async function bulkCreateUsersAction(
  users: CreateUserInput[],
  defaultTeamId?: string,
  defaultTeamName?: string
): Promise<{ results: BulkResult[] }> {
  try {
    const res = await backendFetch("/api/v1/admin/users/bulk", {
      method: "POST",
      body: JSON.stringify({
        users,
        teamId: defaultTeamId || undefined,
        teamName: defaultTeamName || undefined,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Bulk import failed");
    }
    return await res.json();
  } catch (err: any) {
    throw new Error(err.message || "Bulk user creation failed");
  }
}

export async function resetPasswordAction(userId: string): Promise<{ password: string }> {
  try {
    const res = await backendFetch(`/api/v1/admin/users/${userId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to reset password");
    }
    return await res.json();
  } catch (err: any) {
    throw new Error(err.message || "Failed to reset password");
  }
}

export async function updateRoleAction(userId: string, role: string): Promise<void> {
  try {
    const res = await backendFetch(`/api/v1/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to update role");
    }
  } catch (err: any) {
    throw new Error(err.message || "Failed to update user role");
  }
}

export async function deleteUserAction(userId: string): Promise<void> {
  try {
    const res = await backendFetch(`/api/v1/admin/users/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to delete user");
    }
  } catch (err: any) {
    throw new Error(err.message || "Failed to delete user");
  }
}
