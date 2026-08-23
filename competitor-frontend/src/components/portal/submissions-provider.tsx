"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getSubmissionStatusAction, submitCode } from "@/actions/code";
import {
  contestLocked,
  useProctor,
} from "@/components/portal/proctor-provider";
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

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/v1/submissions/stream", {
        withCredentials: true,
      });

      eventSource.addEventListener("submission", (e) => {
        try {
          const data = JSON.parse(e.data) as SubmissionStatusResponse;
          const parsed = parseSubmissionResult(data);
          if (!parsed.submissionId) return;

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
            return;
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
  }, [locked, router]);

  useEffect(() => {
    if (!activeSubmission || locked) return;

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
  }, [activeSubmission, locked]);

  async function submitFast(
    problemId: string,
    code: string,
    previousBest: number,
    language = "cpp",
  ): Promise<SubmitResult> {
    const result = await submitCode(
      problemId,
      code,
      previousBest,
      language,
      attestNonce,
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
