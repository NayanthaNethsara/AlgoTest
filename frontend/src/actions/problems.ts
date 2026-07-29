"use server";

import { revalidatePath } from "next/cache";
import { backendFetch } from "@/lib/api/server";
import type {
  ProblemDetail,
  ProblemInput,
  TestCaseInput,
} from "@/types/problem";

export type { ProblemDetail, ProblemInput, TestCaseInput };

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body.error ?? fallback;
}

export async function createProblemAction(
  input: ProblemInput,
): Promise<{ problem?: ProblemDetail; error?: string }> {
  const res = await backendFetch("/api/v1/admin/problems", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { error: await errorFrom(res, "Failed to create problem") };
  revalidatePath("/admin");
  revalidatePath("/challenges");
  return res.json();
}

export async function updateProblemAction(
  id: string,
  input: ProblemInput,
): Promise<{ problem?: ProblemDetail; error?: string }> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { error: await errorFrom(res, "Failed to update problem") };
  revalidatePath("/admin");
  revalidatePath("/challenges");
  return res.json();
}

export async function togglePublishAction(
  id: string,
  published: boolean,
): Promise<{ error?: string }> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}/publish`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ published }),
  });
  if (!res.ok) return { error: await errorFrom(res, "Failed to change publication status") };
  revalidatePath("/admin");
  revalidatePath("/challenges");
  return {};
}

export async function deleteProblemAction(id: string): Promise<{ error?: string }> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}`, { method: "DELETE" });
  if (!res.ok) return { error: await errorFrom(res, "Failed to delete problem") };
  revalidatePath("/admin");
  revalidatePath("/challenges");
  return {};
}

export async function getAdminProblemDetail(
  id: string,
): Promise<{ problem?: ProblemDetail; error?: string }> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}`);
  if (!res.ok) return { error: await errorFrom(res, "Failed to fetch problem details") };
  return res.json();
}

export async function replaceTestCasesAction(
  id: string,
  tests: TestCaseInput[],
): Promise<{ error?: string }> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}/tests`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tests }),
  });
  if (!res.ok) return { error: await errorFrom(res, "Failed to update test cases") };
  revalidatePath("/admin");
  return {};
}
