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
  attestNonce?: string | null,
): Promise<SubmitResult> {
  try {
    assertLength(code, MAX_CODE_LENGTH, "code");
    const problem = await getProblemAction(problemId);
    const maxScore = problem ? problem.points : 100;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Proof that the browser making this request is on the same machine as the
    // live proctor agent. Read over 127.0.0.1, so only that machine can supply it.
    if (attestNonce) {
      headers["X-Agent-Attest"] = attestNonce;
    }

    const res = await backendFetch("/api/v1/submissions", {
      method: "POST",
      headers,
      body: JSON.stringify({ problem_id: problemId, language, code }),
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
    // Caller-controlled, so an id carrying path segments must not resolve elsewhere.
    const res = await backendFetch(
      `/api/v1/submissions/${encodeURIComponent(submissionId)}`,
      { method: "GET" },
    );
    if (res.ok) {
      return res.json();
    }
  } catch {
    // Ignore transient network errors
  }
  return null;
}

export type SubmissionItemData = {
  id: string;
  problemTitle: string;
  submittedBy: string;
  teamName: string;
  language: string;
  execTime: string;
  status: string;
  submittedAt: string;
  timestamp?: number;
};

export async function listSubmissionsAction(): Promise<SubmissionItemData[]> {
  try {
    const res = await backendFetch("/api/v1/submissions", { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.submissions)) {
        return data.submissions.map((s: any) => ({
          id: s.id,
          problemTitle: s.problem_title || s.problem_id || "Challenge",
          submittedBy: s.user_name || s.user_id || "Competitor",
          teamName: s.team_name || "Team",
          language: s.language || "cpp",
          execTime: s.time_ms ? `${s.time_ms} ms` : "N/A",
          status: s.verdict || s.state || "Pending",
          submittedAt: s.created_at ? new Date(s.created_at).toLocaleTimeString() : "Just now",
          timestamp: s.created_at ? new Date(s.created_at).getTime() : Date.now(),
        }));
      }
    }
  } catch (err) {
    console.error("Failed to fetch submissions from backend:", err);
  }
  return [];
}
