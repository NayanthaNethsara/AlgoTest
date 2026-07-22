"use server";

import { getProblem } from "@/lib/problems";
import type { RunResult, SubmitResult } from "@/types/code";

// Mocked until the Go judge worker is ready. Only the bodies below change then:
// replace the simulation with fetch calls to the backend.

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
  await delay(600);

  if (!code.trim()) {
    return { stdout: "", stderr: "error: empty program", exitCode: 1, timeMs: 0 };
  }

  return {
    stdout: stdin.trim() ? stdin.trim().split("\n").slice(1).join("\n") : "(no output)",
    stderr: "",
    exitCode: 0,
    timeMs: 12 + Math.floor(codeQuality(code) * 40),
  };
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
