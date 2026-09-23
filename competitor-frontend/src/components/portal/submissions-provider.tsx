"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  getSubmissionStatusAction,
  listSubmissionsAction,
  submitCode,
  type SubmissionTelemetry,
} from "@/actions/code";
import {
  contestLocked,
  useProctor,
} from "@/components/portal/proctor-provider";
import { VERDICT_DETAILS } from "@/lib/constants";
import { summarizeSubtasks } from "@/lib/verdict-summary";
import { shouldApplySubmissionProgress } from "@/lib/submission-progress";
import type { SubmitResult } from "@/types/code";
import type {
  ActiveSubmission,
  ReviewNotice,
  SubmissionStatusResponse,
  ToastMessage,
} from "@/types/submission";

type SubmissionsContextType = {
  activeSubmission: ActiveSubmission | null;
  activeSubmissions: Record<string, ActiveSubmission>;
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

  const [activeSubmissions, setActiveSubmissions] =
    useState<Record<string, ActiveSubmission>>({});
  const activeSubmission = Object.values(activeSubmissions).at(-1) ?? null;
  const activeIDs = Object.keys(activeSubmissions).sort().join(",");
  const latest = useRef(new Map<string, SubmissionStatusResponse>());
  const pollIndex = useRef(0);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [lastReview, setLastReview] = useState<ReviewNotice | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [streamHealthy, setStreamHealthy] = useState(false);
  const router = useRouter();

  const clearToast = () => setToast(null);

  useEffect(() => {
    if (locked) return;
    let cancelled = false;

    void listSubmissionsAction(undefined, 50, 0).then((submissions) => {
      if (cancelled) return;
      const restored: Record<string, ActiveSubmission> = {};
      for (const submission of submissions) {
        const status = submission.status.toLowerCase();
        if (
          submission.problemId &&
          (status === "queued" || status === "running")
        ) {
          restored[submission.submissionId] = {
            id: submission.submissionId,
            problemId: submission.problemId,
            status,
          };
        }
      }
      if (Object.keys(restored).length > 0) {
        setActiveSubmissions((current) => ({ ...restored, ...current }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [locked]);

  const applyProgress = useCallback((data: SubmissionStatusResponse) => {
    if (
      !data.submissionId ||
      !shouldApplySubmissionProgress(latest.current.get(data.submissionId), data)
    ) return;
    latest.current.set(data.submissionId, data);
    if (latest.current.size > 256) {
      const oldest = latest.current.keys().next().value;
      if (oldest) latest.current.delete(oldest);
    }
    const parsed = parseSubmissionResult(data);
    if (data.status === "queued" || data.status === "running") {
      const status = data.status;
      setActiveSubmissions((previous) => ({
        ...previous,
        [data.submissionId]: {
          id: data.submissionId,
          problemId: data.problemId,
          status,
          queuePosition: data.queuePosition,
          testsDone: data.testsDone,
          testsTotal: data.testsTotal,
        },
      }));
      return;
    }
    setActiveSubmissions((previous) => {
      const remaining = { ...previous };
      delete remaining[data.submissionId];
      return remaining;
    });
    setLastResult(parsed);
    // Update server-rendered challenge scores for both SSE and polling results.
    router.refresh();
    const accepted = parsed.verdict === "AC";
    const partial = !accepted && parsed.score > 0;
    const label = parsed.verdict
      ? (VERDICT_DETAILS[parsed.verdict]?.label ?? parsed.verdict)
      : "Failed";
    setToast({
      id: data.submissionId,
      title: accepted
        ? "Submission Accepted!"
        : partial ? "Partial credit" : "Submission Failed",
      description: accepted || partial
        ? `Scored ${parsed.score} / ${parsed.maxScore} points.${partial ? ` Verdict: ${label}.` : ""}`
        : parsed.compileError ?? summarizeSubtasks(parsed.subtasks) ?? `Verdict: ${label}`,
      variant: accepted ? "success" : partial ? "info" : "error",
    });
  }, [router]);

  useEffect(() => {
    if (locked) return;

    const controller = new AbortController();
    let isCancelled = false;

    async function streamLoop() {
      let reconnectDelay = 1000;
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
            setStreamHealthy(false);
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

          setStreamHealthy(true);
          reconnectDelay = 1000;

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

                  applyProgress(data);
                } catch {
                  // Ignore JSON parse errors
                }
              }
            }
          }
          setStreamHealthy(false);
          await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
          reconnectDelay = Math.min(reconnectDelay * 2, 15000);
        } catch {
          setStreamHealthy(false);
          if (isCancelled || controller.signal.aborted) return;
          await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
          reconnectDelay = Math.min(reconnectDelay * 2, 15000);
        }
      }
    }

    void streamLoop();

    return () => {
      isCancelled = true;
      setStreamHealthy(false);
      controller.abort();
    };
  }, [locked, router, applyProgress]);

  useEffect(() => {
    if (!activeIDs || streamHealthy) return;
    let cancelled = false;
    let polling = false;

    const interval = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const ids = activeIDs.split(",");
        const id = ids[pollIndex.current % ids.length];
        pollIndex.current++;
        const statusData = await getSubmissionStatusAction(id);
        if (!cancelled && statusData) applyProgress(statusData);
      } finally {
        polling = false;
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeIDs, applyProgress, streamHealthy]);

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
        const id = result.submissionId;
        if (!latest.current.has(id)) {
          setActiveSubmissions((previous) => ({
            ...previous,
            [id]: { id, problemId, status: "queued", queuePosition: result.queuePosition },
          }));
        }
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
        activeSubmissions,
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
