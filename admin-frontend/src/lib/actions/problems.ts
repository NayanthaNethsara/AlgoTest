"use server";

import { backendFetch } from "@/lib/api/server";
import {
  problemInputSchema,
  replaceTestsSchema,
  type ValidatedProblemInput,
} from "@/lib/validation/problem";
import type { ProblemDetail, ProblemInput, TestCaseInput } from "@/types/problem";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function handleResponseError(res: Response, fallback: string): Promise<never> {
  const errText = await res.text().catch(() => "");
  let errMessage = `${fallback} (${res.status})`;
  try {
    const errJson = JSON.parse(errText);
    if (errJson.error) {
      errMessage = errJson.error;
    }
  } catch {
    if (errText && errText.length < 300) {
      errMessage = errText;
    }
  }
  console.error(`[Admin Problems Action] Error ${res.status}:`, errMessage);
  throw new Error(errMessage);
}

export async function listProblemsAction(): Promise<ProblemDetail[]> {
  try {
    const res = await backendFetch("/api/v1/admin/problems");
    if (!res.ok) {
      return handleResponseError(res, "Failed to fetch problems");
    }
    const data = await res.json();
    return data.problems || [];
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to fetch problems"));
  }
}

export async function getProblemDetailAction(id: string): Promise<ProblemDetail> {
  try {
    const res = await backendFetch(`/api/v1/admin/problems/${id}`);
    if (!res.ok) {
      return handleResponseError(res, "Failed to fetch problem detail");
    }
    const data = await res.json();
    return data.problem;
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to fetch problem detail"));
  }
}

export async function createProblemAction(input: ProblemInput): Promise<ProblemDetail> {
  const parsed = problemInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid problem input data");
  }

  const validatedData: ValidatedProblemInput = parsed.data;

  try {
    const res = await backendFetch("/api/v1/admin/problems", {
      method: "POST",
      body: JSON.stringify(validatedData),
    });
    if (!res.ok) {
      return handleResponseError(res, "Failed to create problem");
    }
    const data = await res.json();
    return data.problem;
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to create problem"));
  }
}

export async function updateProblemAction(id: string, input: ProblemInput): Promise<ProblemDetail> {
  const parsed = problemInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid problem input data");
  }

  const validatedData: ValidatedProblemInput = parsed.data;

  try {
    const res = await backendFetch(`/api/v1/admin/problems/${id}`, {
      method: "PUT",
      body: JSON.stringify(validatedData),
    });
    if (!res.ok) {
      return handleResponseError(res, "Failed to update problem");
    }
    const data = await res.json();
    return data.problem;
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to update problem"));
  }
}

export async function togglePublishAction(id: string, published: boolean): Promise<void> {
  try {
    const res = await backendFetch(`/api/v1/admin/problems/${id}/publish`, {
      method: "PATCH",
      body: JSON.stringify({ published }),
    });
    if (!res.ok) {
      return handleResponseError(res, "Failed to update published status");
    }
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to update published status"));
  }
}

export async function deleteProblemAction(id: string): Promise<void> {
  try {
    const res = await backendFetch(`/api/v1/admin/problems/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      return handleResponseError(res, "Failed to delete problem");
    }
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to delete problem"));
  }
}

export async function getProblemTestsAction(id: string): Promise<TestCaseInput[]> {
  try {
    const res = await backendFetch(`/api/v1/admin/problems/${id}/tests`);
    if (!res.ok) {
      return handleResponseError(res, "Failed to fetch test cases");
    }
    const data = await res.json();
    return data.tests || [];
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to fetch test cases"));
  }
}

export async function replaceTestCasesAction(id: string, tests: TestCaseInput[]): Promise<void> {
  const parsed = replaceTestsSchema.safeParse({ tests });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid test case input data");
  }

  try {
    const res = await backendFetch(`/api/v1/admin/problems/${id}/tests`, {
      method: "PUT",
      body: JSON.stringify({ tests: parsed.data.tests }),
    });
    if (!res.ok) {
      return handleResponseError(res, "Failed to update test cases");
    }
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to update test cases"));
  }
}
