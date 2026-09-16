"use client";

import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MIN_EVALUATION_TEST_CASES, type calculateScoringSummary } from "@/lib/testcase-utils";
import { cn } from "@/lib/utils";

interface ScoringSummaryBarProps {
  testCount: number;
  maxScore: number;
  scoring: ReturnType<typeof calculateScoringSummary>;
  hasPendingPointChanges: boolean;
  savingPoints: boolean;
  onSavePoints: () => void;
  onSplitEvenly?: () => void;
}

export function ScoringSummaryBar({
  testCount,
  maxScore,
  scoring,
  hasPendingPointChanges,
  savingPoints,
  onSavePoints,
  onSplitEvenly,
}: ScoringSummaryBarProps) {
  const ok = scoring.hasMinimumCases;

  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-xs sm:flex-row sm:items-center",
        ok ? "bg-muted/20" : "border-destructive/30 bg-destructive/5"
      )}
    >
      <span className="flex items-start gap-2">
        {ok ? (
          <CheckCircle2Icon className="mt-px size-4 shrink-0 text-success" />
        ) : (
          <AlertCircleIcon className="mt-px size-4 shrink-0 text-destructive" />
        )}
        <span className={cn(!ok && "text-destructive")}>
          {!ok
            ? `At least ${MIN_EVALUATION_TEST_CASES} evaluation test cases are required — ${testCount} added.`
            : scoring.hasCustomPoints
              ? `Custom scoring: ${scoring.customPointsSum} / ${maxScore} points across ${testCount} cases.`
              : `Even distribution: ${maxScore} points across ${testCount} cases (~${scoring.autoPointPerTest} each).`}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {testCount > 0 && onSplitEvenly && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onSplitEvenly}
            disabled={savingPoints}
            className="text-[11px]"
          >
            Split evenly
          </Button>
        )}
        {hasPendingPointChanges && (
          <Button
            type="button"
            size="xs"
            onClick={onSavePoints}
            disabled={savingPoints}
            className="gap-1.5"
          >
            {savingPoints && <Spinner />} Save points
          </Button>
        )}
        <span className="font-mono text-[11px] text-muted-foreground">Max {maxScore} pts</span>
      </span>
    </div>
  );
}
