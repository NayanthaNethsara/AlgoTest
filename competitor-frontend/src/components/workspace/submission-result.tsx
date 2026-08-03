"use client";

import { AlertCircle, Check, Loader2, TrendingUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SubmitResult } from "@/types/code";

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

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Total score
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {result.score}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / {result.maxScore}
            </span>
          </span>
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
        {result.subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 p-3"
          >
            <div className="flex items-center gap-2.5">
              <StatusIcon passed={subtask.passed} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Subtask {subtask.id}</span>
                <span className="text-xs text-muted-foreground">
                  {subtask.passed
                    ? "All tests passed"
                    : `Failed on test ${subtask.failedTest ?? 1}`}
                </span>
              </div>
            </div>
            <span
              className={`font-mono text-sm tabular-nums ${
                subtask.passed ? "text-success" : "text-muted-foreground"
              }`}
            >
              {subtask.earned}/{subtask.points}
            </span>
          </div>
        ))}
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
