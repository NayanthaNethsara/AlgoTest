"use server";

import { backendFetch } from "@/lib/api/server";
import { getProblemAction } from "@/actions/problems";
import type { RunResult, SubmissionStatusResponse, SubmitResult } from "@/types/code";

import { executeRun } from "@/lib/runner";

const MAX_CODE_LENGTH = 100_000;
const MAX_STDIN_LENGTH = 1_000_000;

function assertLength(value: string, max: number, name: string) {
  if (typeof value !== "string" || value.length > max) {
    throw new Error(`invalid ${name}`);
  }
}

export async function runCode(
  language: string,
  code: string,
  stdin: string,
): Promise<RunResult> {
  try {
    assertLength(code, MAX_CODE_LENGTH, "code");
    assertLength(stdin, MAX_STDIN_LENGTH, "stdin");

    if (!code.trim()) {
      return { stdout: "", stderr: "error: empty program", exitCode: 1, timeMs: 0 };
    }

    return await executeRun(language, code, stdin);
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
): Promise<SubmitResult> {
  try {
    assertLength(code, MAX_CODE_LENGTH, "code");
    const problem = await getProblemAction(problemId);
    const maxScore = problem ? problem.points : 100;

    const res = await backendFetch("/api/v1/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_id: problemId, language, code }),
    });

    if (res.status === 409 || !res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        error: errBody.error ?? `Submission failed (${res.status})`,
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
      subtasks: [
        { id: 1, points: maxScore, earned: maxScore, passed: true },
      ],
      score: maxScore,
      maxScore,
      improvedBest: maxScore > previousBest,
      previousBest,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to queue submission. Please check your connection.";
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
    const res = await backendFetch(`/api/v1/submissions/${submissionId}`, {
      method: "GET",
    });
    if (res.ok) {
      return res.json();
    }
  } catch {
    // Ignore transient network errors
  }
  return null;
}
