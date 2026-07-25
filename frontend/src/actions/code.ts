"use server";

import { backendFetch } from "@/lib/api/server";
import { getProblem } from "@/lib/problems";
import type { RunResult, SubmitResult } from "@/types/code";

// submitCode is still mocked until hidden-test-case grading is wired up.
// runCode calls the Go backend, which executes the code in a sandboxed
// Docker container against the caller-supplied stdin.

const MAX_CODE_LENGTH = 100_000;
const MAX_STDIN_LENGTH = 1_000_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assertLength(value: string, max: number, name: string) {
  if (typeof value !== "string" || value.length > max) {
    throw new Error(`invalid ${name}`);
  }
}

function codeQuality(code: string): number {
  const meaningful = code.replace(/\s/g, "").length;
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  const size = Math.min(meaningful / 400, 1);
  return Math.min(1, size * 0.7 + ((hash % 100) / 100) * 0.3);
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

  const res = await backendFetch("/api/v1/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code, stdin }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return {
      stdout: "",
      stderr: body.error ?? "run failed",
      exitCode: 1,
      timeMs: 0,
    };
  }

  return res.json();
}

export async function submitCode(
  problemId: string,
  code: string,
  previousBest: number,
): Promise<SubmitResult> {
  assertLength(code, MAX_CODE_LENGTH, "code");
  const problem = getProblem(problemId);
  if (!problem) {
    throw new Error("unknown problem");
  }
  await delay(1100);

  const quality = codeQuality(code);
  const subtasks = problem.subtasks.map((subtask, index) => {
    const threshold = (index + 1) / (problem.subtasks.length + 1);
    const passed = quality >= threshold;
    return {
      id: subtask.id,
      points: subtask.points,
      earned: passed ? subtask.points : 0,
      passed,
      failedTest: passed ? undefined : 1 + Math.floor(quality * 8),
    };
  });

  const score = subtasks.reduce((sum, s) => sum + s.earned, 0);

  return {
    subtasks,
    score,
    maxScore: problem.points,
    improvedBest: score > previousBest,
    previousBest,
  };
}
