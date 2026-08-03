"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getSubmissionStatusAction, submitCode } from "@/actions/code";
import type { SubmitResult } from "@/types/code";

export type ActiveSubmission = {
  id: string;
  problemId: string;
  status: "queued" | "running";
  queuePosition?: number;
};

export type ToastMessage = {
  id: string;
  title: string;
  description: string;
  variant: "success" | "error" | "info";
};

type SubmissionsContextType = {
  activeSubmission: ActiveSubmission | null;
  lastResult: SubmitResult | null;
  toast: ToastMessage | null;
  clearToast: () => void;
  submitFast: (
    problemId: string,
    code: string,
    previousBest: number,
    language?: string,
  ) => Promise<SubmitResult>;
};

const SubmissionsContext = createContext<SubmissionsContextType | null>(null);

function parseSubmissionResult(data: any): SubmitResult & { problemId?: string } {
  const submissionId = data.submissionId || data.submission_id || data.id;
  const problemId = data.problemId || data.problem_id;
  const score = data.score ?? 0;
  const maxScore = data.maxScore ?? data.max_score ?? 100;
  const queuePosition = data.queuePosition ?? data.queue_position;
  const compileError = data.compileError ?? data.compile_error;
  const verdict = data.verdict;
  const status = data.status;

  const rawTests = data.tests;
  const subtasks =
    Array.isArray(rawTests) && rawTests.length > 0
      ? rawTests.map((t: any) => {
          const tTime = t.timeMs ?? t.time_ms;
          return {
            id: t.ordinal,
            points: t.points ?? 0,
            earned: t.verdict === "AC" ? (t.points ?? 0) : 0,
            passed: t.verdict === "AC",
            verdict: t.verdict,
            timeMs: typeof tTime === "number" ? tTime : 0,
          };
        })
      : [];

  return {
    submissionId,
    problemId,
    status,
    score,
    maxScore,
    queuePosition,
    compileError,
    verdict,
    subtasks,
    improvedBest: false,
    previousBest: 0,
  };
}

export function SubmissionsProvider({ children }: { children: ReactNode }) {
  const [activeSubmission, setActiveSubmission] = useState<ActiveSubmission | null>(null);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const clearToast = () => setToast(null);

  // Background SSE listener for real-time submission pushes
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/v1/submissions/stream", {
        withCredentials: true,
      });

      eventSource.addEventListener("submission", (e) => {
        try {
          const data = JSON.parse(e.data);
          const parsed = parseSubmissionResult(data);
          if (!parsed.submissionId) return;

          if (parsed.status === "queued" || parsed.status === "running") {
            setActiveSubmission((prev) => ({
              id: parsed.submissionId!,
              problemId: prev?.problemId || parsed.problemId || "",
              status: parsed.status as "queued" | "running",
              queuePosition: parsed.queuePosition ?? prev?.queuePosition,
            }));
          } else if (parsed.status === "passed" || parsed.status === "failed") {
            setActiveSubmission(null);
            const passed = parsed.status === "passed";

            setLastResult(parsed);

            setToast({
              id: parsed.submissionId,
              title: passed ? "Submission Accepted!" : "Submission Failed",
              description: passed
                ? `Scored ${parsed.score} / ${parsed.maxScore} points.`
                : parsed.compileError
                ? "Compilation Error"
                : `Verdict: ${parsed.verdict || "Failed"}`,
              variant: passed ? "success" : "error",
            });
          }
        } catch {
          // Ignore JSON parse errors
        }
      });
    } catch {
      // EventSource failed or unauthenticated
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  // Background fallback poller if an active submission exists
  useEffect(() => {
    if (!activeSubmission) return;

    const interval = setInterval(async () => {
      const statusData = await getSubmissionStatusAction(activeSubmission.id);
      if (!statusData) return;

      const parsed = parseSubmissionResult(statusData);

      if (parsed.status === "queued" || parsed.status === "running") {
        setActiveSubmission((prev) =>
          prev
            ? {
                ...prev,
                status: parsed.status as "queued" | "running",
                queuePosition: parsed.queuePosition ?? prev.queuePosition,
              }
            : null,
        );
      } else if (parsed.status === "passed" || parsed.status === "failed") {
        setActiveSubmission(null);
        const passed = parsed.status === "passed";

        setLastResult(parsed);

        setToast({
          id: parsed.submissionId || activeSubmission.id,
          title: passed ? "Submission Accepted!" : "Submission Failed",
          description: passed
            ? `Scored ${parsed.score} / ${parsed.maxScore} points.`
            : parsed.compileError
            ? "Compilation Error"
            : `Verdict: ${parsed.verdict || "Failed"}`,
          variant: passed ? "success" : "error",
        });
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeSubmission]);

  async function submitFast(
    problemId: string,
    code: string,
    previousBest: number,
    language = "cpp",
  ): Promise<SubmitResult> {
    const result = await submitCode(problemId, code, previousBest, language);

    if (result.error) {
      setToast({
        id: Date.now().toString(),
        title: "Submission Error",
        description: result.error,
        variant: "error",
      });
      return result;
    }

    if (result.submissionId) {
      setActiveSubmission({
        id: result.submissionId,
        problemId,
        status: "queued",
        queuePosition: result.queuePosition,
      });
    }

    return result;
  }

  return (
    <SubmissionsContext.Provider
      value={{
        activeSubmission,
        lastResult,
        toast,
        clearToast,
        submitFast,
      }}
    >
      {children}
    </SubmissionsContext.Provider>
  );
}

export function useSubmissions() {
  const context = useContext(SubmissionsContext);
  if (!context) {
    throw new Error("useSubmissions must be used within a SubmissionsProvider");
  }
  return context;
}
