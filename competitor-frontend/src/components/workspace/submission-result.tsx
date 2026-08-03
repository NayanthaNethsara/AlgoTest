"use client";

import { AlertCircle, Check, Loader2, TrendingUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SubmitResult } from "@/types/code";

const VERDICT_DETAILS: Record<string, { label: string; style: string }> = {
  AC: { label: "Accepted (AC)", style: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  WA: { label: "Wrong Answer (WA)", style: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  TLE: { label: "Time Limit Exceeded (TLE)", style: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  RTE: { label: "Runtime Error (RTE)", style: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  CE: { label: "Compilation Error (CE)", style: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

export function SubmissionResult({
  result,
  submitting,
  statusMessage,
}: {
  result: SubmitResult | null;
  submitting: boolean;
  statusMessage?: string;
}) {
  if (submitting) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <span>{statusMessage || "Submitting to evaluation queue..."}</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Submit code to evaluate against contest test cases.
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Submission Error</span>
            <span>{result.error}</span>
          </div>
        </div>
      </div>
    );
  }

  const overallVerdict = result.verdict ? VERDICT_DETAILS[result.verdict] : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 pb-16">
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Total score
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {result.score}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {result.maxScore}
              </span>
            </span>
            {overallVerdict && (
              <Badge variant="outline" className={`text-xs font-medium ${overallVerdict.style}`}>
                {overallVerdict.label}
              </Badge>
            )}
          </div>
        </div>
        {result.improvedBest ? (
          <Badge className="bg-success/15 text-success">
            <TrendingUp className="size-3" />
            New best
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            Best: {result.previousBest}
          </span>
        )}
      </div>

      {result.compileError && (
        <div className="rounded-lg border bg-destructive/10 p-3 text-xs font-mono text-destructive">
          <span className="font-semibold">Compilation Error:</span>
          <pre className="mt-1 whitespace-pre-wrap">{result.compileError}</pre>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Test Case Evaluation Breakdown
        </span>
        {result.subtasks.map((subtask) => {
          const vDetails = subtask.verdict ? VERDICT_DETAILS[subtask.verdict] : null;
          return (
            <div
              key={subtask.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 p-3"
            >
              <div className="flex items-center gap-2.5">
                <StatusIcon passed={subtask.passed} />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Test #{subtask.id}</span>
                    {vDetails && (
                      <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${vDetails.style}`}>
                        {vDetails.label}
                      </Badge>
                    )}
                  </div>
                  {typeof subtask.timeMs === "number" && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Time: {subtask.timeMs}ms
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`font-mono text-sm tabular-nums ${
                  subtask.passed ? "text-success" : "text-muted-foreground"
                }`}
              >
                {subtask.earned}/{subtask.points} pts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success">
      <Check className="size-3.5" />
    </span>
  ) : (
    <span className="flex size-5 items-center justify-center rounded-full bg-destructive/15 text-destructive">
      <X className="size-3.5" />
    </span>
  );
}
