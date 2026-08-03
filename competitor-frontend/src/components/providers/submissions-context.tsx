"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getSubmissionStatusAction, submitCode } from "@/actions/code";
import type { SubmissionStatus, SubmitResult } from "@/types";

type ActiveSubmission = {
  id: string;
  problemId: string;
  status: SubmissionStatus;
  queuePosition?: number;
};

type ToastMessage = {
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

export function SubmissionsProvider({ children }: { children: React.ReactNode }) {
  const [activeSubmission, setActiveSubmission] = useState<ActiveSubmission | null>(null);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

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
          if (!data || !data.submission_id) return;

          if (data.status === "queued") {
            setActiveSubmission({
              id: data.submission_id,
              problemId: data.problem_id,
              status: "queued",
              queuePosition: data.queue_position,
            });
          } else if (data.status === "running") {
            setActiveSubmission({
              id: data.submission_id,
              problemId: data.problem_id,
              status: "running",
            });
          } else if (data.status === "passed" || data.status === "failed") {
            setActiveSubmission(null);
            const score = data.score ?? 0;
            const maxScore = data.max_score ?? 100;
            const passed = data.status === "passed";

            setLastResult({
              submissionId: data.submission_id,
              status: data.status,
              score,
              maxScore,
              improvedBest: false,
              previousBest: 0,
              compileError: data.compile_error,
              subtasks: [
                { id: 1, points: maxScore, earned: score, passed },
              ],
            });

            setToast({
              id: data.submission_id,
              title: passed ? "Submission Accepted!" : "Submission Failed",
              description: passed
                ? `Scored ${score} / ${maxScore} points.`
                : data.compile_error
                ? "Compilation Error"
                : `Verdict: ${data.verdict || "Failed"}`,
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

      if (statusData.status === "queued") {
        setActiveSubmission((prev) =>
          prev
            ? { ...prev, status: "queued", queuePosition: statusData.queue_position }
            : null,
        );
      } else if (statusData.status === "running") {
        setActiveSubmission((prev) =>
          prev ? { ...prev, status: "running" } : null,
        );
      } else if (statusData.status === "passed" || statusData.status === "failed") {
        setActiveSubmission(null);
        const score = statusData.score ?? 0;
        const maxScore = statusData.max_score ?? 100;
        const passed = statusData.status === "passed";

        setLastResult({
          submissionId: statusData.submission_id,
          status: statusData.status,
          score,
          maxScore,
          improvedBest: false,
          previousBest: 0,
          compileError: statusData.compile_error,
          subtasks: [{ id: 1, points: maxScore, earned: score, passed }],
        });

        setToast({
          id: statusData.submission_id,
          title: passed ? "Submission Accepted!" : "Submission Failed",
          description: passed
            ? `Scored ${score} / ${maxScore} points.`
            : statusData.compile_error
            ? "Compilation Error"
            : `Verdict: ${statusData.verdict || "Failed"}`,
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

      setToast({
        id: result.submissionId,
        title: "Submission Queued",
        description: `Position #${result.queuePosition ?? 1} in queue. You can continue writing code or switch tabs.`,
        variant: "info",
      });
    }

    return result;
  }

  function clearToast() {
    setToast(null);
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
  const ctx = useContext(SubmissionsContext);
  if (!ctx) {
    throw new Error("useSubmissions must be used within a SubmissionsProvider");
  }
  return ctx;
}
