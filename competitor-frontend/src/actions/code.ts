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
  assertLength(code, MAX_CODE_LENGTH, "code");
  assertLength(stdin, MAX_STDIN_LENGTH, "stdin");

  if (!code.trim()) {
    return { stdout: "", stderr: "error: empty program", exitCode: 1, timeMs: 0 };
  }

  return executeRun(language, code, stdin);
}

export async function submitCode(
  problemId: string,
  code: string,
  previousBest: number,
  language = "cpp",
): Promise<SubmitResult> {
  assertLength(code, MAX_CODE_LENGTH, "code");
  const problem = await getProblemAction(problemId);
  if (!problem) {
    throw new Error("unknown problem");
  }

  try {
    const res = await backendFetch("/api/v1/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_id: problemId, language, code }),
    });

    if (res.status === 409) {
      const errBody = await res.json().catch(() => ({}));
      return {
        error: errBody.error ?? "Active submission already in progress.",
        subtasks: [],
        score: previousBest,
        maxScore: problem.points,
        improvedBest: false,
        previousBest,
      };
    }

    if (res.ok) {
      const data = await res.json();
      return {
        submissionId: data.id,
        status: data.status,
        queuePosition: data.queue_position,
        subtasks: [
          { id: 1, points: problem.points, earned: problem.points, passed: true },
        ],
        score: problem.points,
        maxScore: problem.points,
        improvedBest: problem.points > previousBest,
        previousBest,
      };
    }
  } catch {
    // Backend fetch failed or unauthenticated
  }

  return {
    error: "Failed to queue submission. Please check your network connection.",
    subtasks: [],
    score: previousBest,
    maxScore: problem.points,
    improvedBest: false,
    previousBest,
  };
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
