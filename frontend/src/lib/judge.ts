import type { Problem } from "@/lib/problem";

// The Go judge worker is still a stub, so run/submit are simulated on the
// client. Swap these two functions for real API calls once judging lands.

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timeMs: number;
};

export type SubtaskResult = {
  id: number;
  points: number;
  earned: number;
  passed: boolean;
  failedTest?: number;
};

export type SubmitResult = {
  subtasks: SubtaskResult[];
  score: number;
  maxScore: number;
  improvedBest: boolean;
  previousBest: number;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Deterministic pseudo-quality in [0, 1] derived from the code, so editing the
// solution changes the simulated outcome but re-submitting the same code does not.
function codeQuality(code: string): number {
  const meaningful = code.replace(/\s/g, "").length;
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  const size = Math.min(meaningful / 400, 1);
  return Math.min(1, size * 0.7 + (hash % 100) / 100 * 0.3);
}

export async function runCode(code: string, stdin: string): Promise<RunResult> {
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
  problem: Problem,
  code: string,
  previousBest: number,
): Promise<SubmitResult> {
  await delay(1100);

  const quality = codeQuality(code);
  const subtasks: SubtaskResult[] = problem.subtasks.map((subtask, index) => {
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
