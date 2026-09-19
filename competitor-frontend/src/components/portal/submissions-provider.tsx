"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  getSubmissionStatusAction,
  submitCode,
  type SubmissionTelemetry,
} from "@/actions/code";
import {
  contestLocked,
  useProctor,
} from "@/components/portal/proctor-provider";
import { VERDICT_DETAILS } from "@/lib/constants";
import { summarizeSubtasks } from "@/lib/verdict-summary";
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
): SubmitResult & { submissionId: string; problemId: string } {
  const subtasks = (data.tests ?? []).map((test) => ({
    id: test.ordinal,
    points: test.maxPoints,
    earned: test.points,
    passed: test.verdict === "AC",
    verdict: test.verdict,
    timeMs: test.timeMs,
  }));

  return {
    submissionId: data.submissionId,
    problemId: data.problemId,
    status: data.status,
    score: data.score,
    maxScore: data.maxScore,
    queuePosition: data.queuePosition,
    compileError: data.compileError,
    verdict: data.verdict,
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
            if (res.status === 423) {
              // Account is locked or unenrolled by proctor gate -- wait 10s
              await new Promise((resolve) => setTimeout(resolve, 10000));
            } else if (res.status === 429) {
              // Rate limited -- back off 15s
              await new Promise((resolve) => setTimeout(resolve, 15000));
            } else if (res.status === 401) {
              // Session expired or unauthenticated -- wait 10s before retry
              await new Promise((resolve) => setTimeout(resolve, 10000));
            } else {
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }
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
                      title: rejected
                        ? "Submission rejected"
                        : "Submission reinstated",
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

                  if (
                    parsed.status === "queued" ||
                    parsed.status === "running"
                  ) {
                    setActiveSubmission((prev) => ({
                      id: parsed.submissionId!,
                      problemId: parsed.problemId ?? prev?.problemId ?? "",
                      status: parsed.status as "queued" | "running",
                      queuePosition:
                        parsed.queuePosition ?? prev?.queuePosition,
                      testsDone: data.testsDone ?? prev?.testsDone,
                      testsTotal: data.testsTotal ?? prev?.testsTotal,
                    }));
                  } else if (
                    parsed.status === "passed" ||
                    parsed.status === "failed"
                  ) {
                    setActiveSubmission(null);
                    const passed = parsed.status === "passed";

                    setLastResult(parsed);

                    const verdictLabel = parsed.verdict
                      ? (VERDICT_DETAILS[parsed.verdict]?.label ??
                        parsed.verdict)
                      : "Failed";

                    setToast({
                      id: parsed.submissionId,
                      title: passed
                        ? "Submission Accepted!"
                        : "Submission Failed",
                      description: passed
                        ? `Scored ${parsed.score} / ${parsed.maxScore} points.`
                        : parsed.compileError
                          ? parsed.compileError
                          : (summarizeSubtasks(parsed.subtasks) ??
                            `Verdict: ${verdictLabel}`),
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
                testsDone: Math.max(
                  statusData.testsDone ?? 0,
                  prev.testsDone ?? 0,
                ),
                testsTotal: statusData.testsTotal ?? prev.testsTotal,
              }
            : null,
        );
      } else if (parsed.status === "passed" || parsed.status === "failed") {
        setActiveSubmission(null);
        const passed = parsed.status === "passed";

        setLastResult(parsed);

        const verdictLabel = parsed.verdict
          ? (VERDICT_DETAILS[parsed.verdict]?.label ?? parsed.verdict)
          : "Failed";

        setToast({
          id: parsed.submissionId,
          title: passed ? "Submission Accepted!" : "Submission Failed",
          description: passed
            ? `Scored ${parsed.score} / ${parsed.maxScore} points.`
            : parsed.compileError
              ? parsed.compileError
              : (summarizeSubtasks(parsed.subtasks) ??
                `Verdict: ${verdictLabel}`),
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
    if (lastResult?.problemId === problemId) {
      setLastResult(null);
    }
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
      const msg =
        err instanceof Error ? err.message : "Failed to process submission";
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
