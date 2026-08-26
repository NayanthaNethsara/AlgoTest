"use client";

import { AlertCircle, Check, Loader2, TrendingUp, X } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { VERDICT_DETAILS } from "@/lib/constants";
import type { SubmitResult } from "@/types/code";
import type { VariantProps } from "class-variance-authority";

export function SubmissionResult({
  result,
  submitting,
  statusMessage,
}: {
  result: SubmitResult | null;
  submitting: boolean;
  statusMessage?: string;
}) {
  const hasFinalVerdict =
    Boolean(result?.verdict) ||
    result?.status === "passed" ||
    result?.status === "failed";

  const isEvaluating =
    !hasFinalVerdict &&
    (submitting || result?.status === "queued" || result?.status === "running");

  if (isEvaluating) {
    const queueMsg =
      typeof result?.queuePosition === "number" && result.queuePosition > 1
        ? `In evaluation queue (Position: #${result.queuePosition})...`
        : result?.status === "running"
          ? "Judging test cases on runner sandbox..."
          : "Submitting to evaluation queue...";

    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-xs text-muted-foreground font-mono">
        <Loader2 className="size-6 pixel-spin text-primary" />
        <span>{statusMessage || queueMsg}</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-4 text-xs text-muted-foreground font-mono">
        Submit your code to evaluate it against the hidden contest test cases.
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-3 pixel-flat border-destructive/60 bg-destructive/15 p-4 text-destructive">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">Submission error</span>
            <span>{result.error}</span>
          </div>
        </div>
      </div>
    );
  }

  const overallVerdict = result.verdict
    ? (VERDICT_DETAILS[result.verdict] ?? {
        label: result.verdict,
        variant: result.verdict === "AC" ? "success" : "destructive",
      })
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 pb-16 font-mono">
      <div className="flex items-center justify-between pixel-raised bg-card p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Total score
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold text-amber-400">
              {result.score}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {result.maxScore} XP
              </span>
            </span>
            {overallVerdict && (
              <Badge
                variant={
                  overallVerdict.variant as VariantProps<
                    typeof badgeVariants
                  >["variant"]
                }
                className="text-[10px] font-semibold uppercase"
              >
                {overallVerdict.label}
              </Badge>
            )}
          </div>
        </div>
        {result.improvedBest ? (
          <Badge
            variant="success"
            className="text-[10px] font-semibold uppercase"
          >
            <TrendingUp className="size-3" />
            New best!
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground font-medium">
            Best: {result.previousBest} XP
          </span>
        )}
      </div>

      {result.compileError && (
        <div className="badge-destructive pixel-flat p-3 text-xs font-mono">
          <span className="font-semibold uppercase text-[10px] tracking-wide">
            {result.verdict === "CE" ? "Compilation error:" : "Evaluation error:"}
          </span>
          <pre className="mt-1 whitespace-pre-wrap">{result.compileError}</pre>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Test case breakdown
        </span>
        {result.subtasks.length === 0 ? (
          <div className="pixel-flat bg-card/80 p-3 text-xs text-muted-foreground">
            No test case breakdown available for this submission.
          </div>
        ) : (
          result.subtasks.map((subtask) => {
            const vDetails = subtask.verdict
              ? (VERDICT_DETAILS[subtask.verdict] ?? {
                  label: subtask.verdict,
                  variant: subtask.passed ? "success" : "destructive",
                })
              : null;
            return (
              <div
                key={subtask.id}
                className="flex items-center justify-between gap-3 pixel-flat bg-card/80 p-3"
              >
                <div className="flex items-center gap-3">
                  <StatusIcon passed={subtask.passed} />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">
                        Test #{subtask.id}
                      </span>
                      {vDetails && (
                        <Badge
                          variant={
                            vDetails.variant as VariantProps<
                              typeof badgeVariants
                            >["variant"]
                          }
                          className="text-[9px] py-0 px-1.5 uppercase"
                        >
                          {vDetails.label}
                        </Badge>
                      )}
                    </div>
                    {typeof subtask.timeMs === "number" && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Time: {subtask.timeMs}ms
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold ${subtask.passed ? "text-success" : "text-muted-foreground"}`}
                >
                  {subtask.earned}/{subtask.points} XP
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="flex size-5 items-center justify-center bg-success text-black font-bold text-xs">
      <Check className="size-3.5 stroke-[3]" />
    </span>
  ) : (
    <span className="flex size-5 items-center justify-center bg-destructive text-white font-bold text-xs">
      <X className="size-3.5 stroke-[3]" />
    </span>
  );
}
