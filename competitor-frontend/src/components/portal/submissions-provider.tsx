"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getSubmissionStatusAction, submitCode, type SubmissionTelemetry } from "@/actions/code";
import {
  contestLocked,
  useProctor,
} from "@/components/portal/proctor-provider";
import { VERDICT_DETAILS } from "@/lib/constants";
import type { SubmitResult } from "@/types/code";
import type {
  ActiveSubmission,
  ReviewNotice,
  SubmissionStatusResponse,
  ToastMessage,
} from "@/types/submission";

type SubmissionsContextType = {
  activeSubmission: ActiveSubmission | null;
  lastResult: SubmitResult | null;
  lastReview: ReviewNotice | null;
  toast: ToastMessage | null;
  clearToast: () => void;
  submitFast: (
    problemId: string,
    code: string,
    previousBest: number,
    language?: string,
    telemetry?: SubmissionTelemetry,
  ) => Promise<SubmitResult>;
};

const SubmissionsContext = createContext<SubmissionsContextType | null>(null);

function parseSubmissionResult(
  data: SubmissionStatusResponse,
): SubmitResult & { problemId?: string } {
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
      ? rawTests.map((t) => {
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
  const proctor = useProctor();
  const { attestNonce } = proctor;
  const locked = contestLocked(proctor);

  const [activeSubmission, setActiveSubmission] =
    useState<ActiveSubmission | null>(null);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [lastReview, setLastReview] = useState<ReviewNotice | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const router = useRouter();

  const clearToast = () => setToast(null);

  useEffect(() => {
    if (locked) return;

    const controller = new AbortController();
    let isCancelled = false;

    async function streamLoop() {
      while (!isCancelled && !controller.signal.aborted) {
        try {
          const res = await fetch("/api/v1/submissions/stream", {
            headers: {
              Accept: "text/event-stream",
              "Cache-Control": "no-cache",
            },
            credentials: "include",
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            continue;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!isCancelled && !controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";

            for (const chunk of chunks) {
              if (!chunk.trim()) continue;
              let eventType = "message";
              let dataStr = "";

              for (const line of chunk.split("\n")) {
                if (line.startsWith("event:")) {
                  eventType = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                  dataStr += (dataStr ? "\n" : "") + line.slice(5).trim();
                }
              }

              if (eventType === "submission" && dataStr) {
                try {
                  const data = JSON.parse(dataStr) as SubmissionStatusResponse;
                  const parsed = parseSubmissionResult(data);
                  if (!parsed.submissionId) continue;

                  if (data.reviewStatus) {
                    const rejected = data.reviewStatus === "rejected";
                    setLastReview({
                      submissionId: parsed.submissionId,
                      reviewStatus: data.reviewStatus,
                      reviewReason: data.reviewReason,
                    });
                    setToast({
                      id: `review-${parsed.submissionId}`,
                      title: rejected ? "Submission rejected" : "Submission reinstated",
                      description: rejected
                        ? data.reviewReason
                          ? `An organizer removed it from the leaderboard: ${data.reviewReason}`
                          : "An organizer removed it from the leaderboard."
                        : "An organizer restored it. It counts towards your score again.",
                      variant: rejected ? "error" : "success",
                    });
                    router.refresh();
                    continue;
                  }

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

                    const verdictLabel = parsed.verdict
                      ? (VERDICT_DETAILS[parsed.verdict]?.label || parsed.verdict)
                      : "Failed";

                    setToast({
                      id: parsed.submissionId,
                      title: passed ? "Submission Accepted!" : "Submission Failed",
                      description: passed
                        ? `Scored ${parsed.score} / ${parsed.maxScore} points.`
                        : parsed.compileError
                          ? parsed.compileError
                          : `Verdict: ${verdictLabel}`,
                      variant: passed ? "success" : "error",
                    });
                  }
                } catch {
                  // Ignore JSON parse errors
                }
              }
            }
          }
        } catch {
          if (isCancelled || controller.signal.aborted) return;
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }

    void streamLoop();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [locked, router]);

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

        const verdictLabel = parsed.verdict
          ? (VERDICT_DETAILS[parsed.verdict]?.label || parsed.verdict)
          : "Failed";

        setToast({
          id: parsed.submissionId || activeSubmission.id,
          title: passed ? "Submission Accepted!" : "Submission Failed",
          description: passed
            ? `Scored ${parsed.score} / ${parsed.maxScore} points.`
            : parsed.compileError
              ? parsed.compileError
              : `Verdict: ${verdictLabel}`,
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
    telemetry?: SubmissionTelemetry,
  ): Promise<SubmitResult> {
    try {
      const result = await submitCode(
        problemId,
        code,
        previousBest,
        language,
        attestNonce,
        telemetry,
      );

      if (result.error) {
        const gateRefusal =
          result.errorCode?.startsWith("AGENT_") ||
          result.errorCode === "NOT_ATTESTED";
        setToast({
          id: Date.now().toString(),
          title: gateRefusal ? "Submissions are locked" : "Submission Error",
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process submission";
      setToast({
        id: Date.now().toString(),
        title: "Submission Error",
        description: msg,
        variant: "error",
      });
      return {
        error: msg,
        subtasks: [],
        score: previousBest,
        maxScore: 100,
        improvedBest: false,
        previousBest,
      };
    }
  }

  return (
    <SubmissionsContext.Provider
      value={{
        activeSubmission,
        lastResult,
        lastReview,
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
