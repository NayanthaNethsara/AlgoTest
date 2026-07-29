"use server";

import { backendFetch } from "@/lib/api/server";
import type { ProblemDetail, ProblemInput, TestCaseInput } from "@/types/problem";

export async function listProblemsAction(): Promise<ProblemDetail[]> {
  const res = await backendFetch("/api/v1/admin/problems");
  if (!res.ok) throw new Error("Failed to fetch problems");
  const data = await res.json();
  return data.problems || [];
}

export async function getProblemDetailAction(id: string): Promise<ProblemDetail> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}`);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to fetch problem detail");
  }
  const data = await res.json();
  return data.problem;
}

export async function createProblemAction(input: ProblemInput): Promise<ProblemDetail> {
  const res = await backendFetch("/api/v1/admin/problems", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to create problem");
  }
  const data = await res.json();
  return data.problem;
}

export async function updateProblemAction(id: string, input: ProblemInput): Promise<ProblemDetail> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to update problem");
  }
  const data = await res.json();
  return data.problem;
}

export async function togglePublishAction(id: string, published: boolean): Promise<void> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}/publish`, {
    method: "PATCH",
    body: JSON.stringify({ published }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to update published status");
  }
}

export async function deleteProblemAction(id: string): Promise<void> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to delete problem");
  }
}

export async function replaceTestCasesAction(id: string, tests: TestCaseInput[]): Promise<void> {
  const res = await backendFetch(`/api/v1/admin/problems/${id}/tests`, {
    method: "PUT",
    body: JSON.stringify({ tests }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to update test cases");
  }
}
