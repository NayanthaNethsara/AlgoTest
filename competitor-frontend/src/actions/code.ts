"use server";

import { getProblemAction } from "@/actions/problems";
import { backendFetch } from "@/lib/api/server";
import { MAX_CODE_LENGTH, MAX_STDIN_LENGTH } from "@/lib/constants";
import { executeRun } from "@/lib/runner";
import type {
  RunResult,
  SubmissionStatusResponse,
  SubmitResult,
} from "@/types/code";
import type { SubmissionItem } from "@/types/submission";

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
      return {
        stdout: "",
        stderr: "error: empty program",
        exitCode: 1,
        timeMs: 0,
      };
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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
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

type BackendSubmissionEntry = {
  submissionId: string;
  problemId?: string;
  problemTitle?: string;
  userName?: string;
  teamName?: string;
  language?: string;
  score?: number;
  maxScore?: number;
  status?: string;
  verdict?: string;
  reviewStatus?: "accepted" | "rejected";
  reviewReason?: string;
  createdAt?: string;
};

export async function listSubmissionsAction(): Promise<SubmissionItem[]> {
  try {
    const res = await backendFetch("/api/v1/submissions", { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.submissions)) {
        return data.submissions.map(
          (s: BackendSubmissionEntry): SubmissionItem => ({
            id: s.submissionId,
            problemTitle: s.problemTitle || s.problemId || "Challenge",
            submittedBy: s.userName || "Competitor",
            teamName: s.teamName || "Team",
            language: s.language || "cpp",
            score: s.score ?? 0,
            maxScore: s.maxScore ?? 0,
            status: s.verdict || s.status || "Pending",
            reviewStatus: s.reviewStatus,
            reviewReason: s.reviewReason,
            submittedAt: s.createdAt
              ? new Date(s.createdAt).toLocaleTimeString()
              : "Just now",
            timestamp: s.createdAt ? new Date(s.createdAt).getTime() : Date.now(),
          }),
        );
      }
    }
  } catch (err) {
    console.error("Failed to fetch submissions:", err);
  }
  return [];
}
