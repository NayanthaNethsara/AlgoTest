"use server";

import { backendFetch } from "@/lib/api/server";
import { parseApiError, getErrorMessage } from "@/lib/errors";
import {
  createUserInputSchema,
  bulkCreateUsersSchema,
  suspendUserSchema,
  updateRoleSchema,
} from "@/lib/validation/user";
import type { User, CreateUserInput, BulkResult } from "@/types/user";

export async function listUsersAction(): Promise<User[]> {
  try {
    const res = await backendFetch("/api/v1/admin/users");
    if (!res.ok) {
      throw await parseApiError(res, "Failed to fetch users");
    }
    const data = (await res.json()) as { users?: User[] };
    return data.users ?? [];
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to fetch users"));
  }
}

export async function createUserAction(
  input: CreateUserInput
): Promise<{ user: User; password?: string }> {
  const parsed = createUserInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message ?? "Invalid user input data");
  }

  try {
    const res = await backendFetch("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to create user");
    }
    return (await res.json()) as { user: User; password?: string };
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to create user"));
  }
}

export async function bulkCreateUsersAction(
  users: CreateUserInput[],
  defaultTeamId?: string,
  defaultTeamName?: string
): Promise<{ results: BulkResult[] }> {
  const parsed = bulkCreateUsersSchema.safeParse({
    users,
    defaultTeamId,
    defaultTeamName,
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message ?? "Invalid bulk user input data");
  }

  try {
    const res = await backendFetch("/api/v1/admin/users/bulk", {
      method: "POST",
      body: JSON.stringify({
        users: parsed.data.users,
        teamId: parsed.data.defaultTeamId || undefined,
        teamName: parsed.data.defaultTeamName || undefined,
      }),
    });
    if (!res.ok) {
      throw await parseApiError(res, "Bulk import failed");
    }
    return await res.json();
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Bulk user creation failed"));
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
      throw await parseApiError(res, "Failed to reset password");
    }
    return await res.json();
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to reset password"));
  }
}

export async function updateRoleAction(userId: string, role: string): Promise<void> {
  const parsed = updateRoleSchema.safeParse({ role });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message ?? "Invalid role");
  }

  try {
    const res = await backendFetch(`/api/v1/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: parsed.data.role }),
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to update role");
    }
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to update user role"));
  }
}

export async function deleteUserAction(userId: string): Promise<void> {
  try {
    const res = await backendFetch(`/api/v1/admin/users/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to delete user");
    }
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to delete user"));
  }
}

export async function suspendUserAction(
  userId: string,
  suspended: boolean,
  reason?: string
): Promise<void> {
  const parsed = suspendUserSchema.safeParse({ suspended, reason });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message ?? "Invalid suspension data");
  }

  try {
    const res = await backendFetch(`/api/v1/admin/users/${userId}/suspend`, {
      method: "PATCH",
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to update user suspension");
    }
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to update user suspension"));
  }
}
