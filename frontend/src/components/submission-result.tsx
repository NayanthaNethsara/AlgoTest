"use client";

import { Check, TrendingUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SubmitResult } from "@/lib/judge";

export function SubmissionResult({
  result,
  submitting,
}: {
  result: SubmitResult | null;
  submitting: boolean;
}) {
  if (submitting) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Running against hidden test cases…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Submit to score against hidden test cases.
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
                    : `Failed on test ${subtask.failedTest}`}
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
