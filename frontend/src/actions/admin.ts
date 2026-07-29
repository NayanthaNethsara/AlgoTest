"use server";

import { revalidatePath } from "next/cache";
import { backendFetch } from "@/lib/api/server";
import type { SessionUser } from "@/lib/auth/constants";
import type { CreateUserInput, BulkResult } from "@/types/user";

export type AdminUser = SessionUser;
export type { CreateUserInput, BulkResult };

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body.error ?? fallback;
}

export async function createUser(
  input: CreateUserInput,
): Promise<{ user: AdminUser; password: string } | { error: string }> {
  const res = await backendFetch("/api/v1/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { error: await errorFrom(res, "Failed to create user") };
  revalidatePath("/admin");
  return res.json();
}

export async function resetPassword(
  id: string,
): Promise<{ password: string } | { error: string }> {
  const res = await backendFetch(`/api/v1/admin/users/${id}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) return { error: await errorFrom(res, "Failed to reset password") };
  return res.json();
}

export async function updateRole(id: string, role: string): Promise<{ error?: string }> {
  const res = await backendFetch(`/api/v1/admin/users/${id}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) return { error: await errorFrom(res, "Failed to change role") };
  revalidatePath("/admin");
  return {};
}

export async function deleteUser(id: string): Promise<{ error?: string }> {
  const res = await backendFetch(`/api/v1/admin/users/${id}`, { method: "DELETE" });
  if (!res.ok) return { error: await errorFrom(res, "Failed to delete user") };
  revalidatePath("/admin");
  return {};
}

export async function bulkCreateUsers(
  text: string,
  role: string,
): Promise<{ results: BulkResult[] } | { error: string }> {
  const users = parseCsv(text);
  if (users.length === 0) return { error: "No valid rows found" };

  const res = await backendFetch("/api/v1/admin/users/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, users }),
  });
  if (!res.ok) return { error: await errorFrom(res, "Bulk import failed") };
  revalidatePath("/admin");
  return res.json();
}

// parseCsv reads "username,display_name,password" rows; the last two are optional.
function parseCsv(text: string): CreateUserInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^username\b/i.test(line))
    .map((line) => {
      const [username, displayName, password] = line.split(",").map((s) => s?.trim());
      return { username, displayName: displayName || undefined, password: password || undefined };
    })
    .filter((u) => u.username);
}
