"use server";

import { getProblemAction } from "@/actions/problems";
import { backendFetch } from "@/lib/api/server";
import { executeRun } from "@/lib/runner";
import {
  runCodeInputSchema,
  submitCodeInputSchema,
} from "@/lib/validation/submission";
import type {
  RunResult,
  SubmissionStatusResponse,
  SubmitResult,
} from "@/types/code";
import type { SubmissionItem } from "@/types/submission";

export async function runCode(
  language: string,
  code: string,
  stdin: string,
): Promise<RunResult> {
  const parsed = runCodeInputSchema.safeParse({ language, code, stdin });
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Invalid run parameters";
    return { stdout: "", stderr: `Error: ${errorMsg}`, exitCode: 1, timeMs: 0 };
  }

  try {
    return await executeRun(parsed.data.language, parsed.data.code, parsed.data.stdin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Execution failed";
    return { stdout: "", stderr: `Error: ${message}`, exitCode: 1, timeMs: 0 };
  }
}

export async function submitCode(
  problemId: string,
  code: string,
  previousBest: number,
  language = "cpp",
  attestNonce?: string | null,
): Promise<SubmitResult> {
  const parsed = submitCodeInputSchema.safeParse({
    problemId,
    code,
    language,
    previousBest,
    attestNonce,
  });

  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Invalid submission parameters";
    return {
      error: errorMsg,
      subtasks: [],
      score: previousBest,
      maxScore: 100,
      improvedBest: false,
      previousBest,
    };
  }

  try {
    const problem = await getProblemAction(parsed.data.problemId);
    const maxScore = problem ? problem.points : 100;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (parsed.data.attestNonce) {
      headers["X-Agent-Attest"] = parsed.data.attestNonce;
    }

    const res = await backendFetch("/api/v1/submissions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        problem_id: parsed.data.problemId,
        language: parsed.data.language,
        code: parsed.data.code,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        error: errBody.error ?? `Submission failed (${res.status})`,
        errorCode: errBody.code,
        secondsSincePing: errBody.seconds_since_ping,
        subtasks: [],
        score: previousBest,
        maxScore,
        improvedBest: false,
        previousBest,
      };
    }

    const data = await res.json();
    return {
      submissionId: data.id,
      status: data.status,
      queuePosition: data.queue_position,
      subtasks: [],
      score: 0,
      maxScore,
      improvedBest: false,
      previousBest,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : "Failed to queue submission. Please check your connection.";
    return {
      error: errorMsg,
      subtasks: [],
      score: previousBest,
      maxScore: 100,
      improvedBest: false,
      previousBest,
    };
  }
}

export async function getSubmissionStatusAction(
  submissionId: string,
): Promise<SubmissionStatusResponse | null> {
  try {
    const res = await backendFetch(`/api/v1/submissions/${encodeURIComponent(submissionId)}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return {
      id: data.id,
      status: data.state || data.status,
      verdict: data.verdict,
      score: data.score,
      maxScore: data.max_score,
      queuePosition: data.queue_position,
      compileError: data.compile_error,
      tests: data.tests,
    };
  } catch (err) {
    console.error("getSubmissionStatusAction error:", err);
    return null;
  }
}

export async function listSubmissionsAction(
  problemId?: string,
): Promise<SubmissionItem[]> {
  try {
    const url = problemId
      ? `/api/v1/submissions?problem_id=${encodeURIComponent(problemId)}`
      : "/api/v1/submissions";

    const res = await backendFetch(url, { cache: "no-store" });
    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return data.submissions || [];
  } catch (err) {
    console.error("listSubmissionsAction error:", err);
    return [];
  }
}
