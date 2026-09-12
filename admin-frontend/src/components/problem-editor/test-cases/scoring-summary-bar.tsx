"use client";

import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MIN_EVALUATION_TEST_CASES, type calculateScoringSummary } from "@/lib/testcase-utils";

interface ScoringSummaryBarProps {
  testCount: number;
  maxScore: number;
  scoring: ReturnType<typeof calculateScoringSummary>;
  hasPendingPointChanges: boolean;
  savingPoints: boolean;
  onSavePoints: () => void;
}

export function ScoringSummaryBar({
  testCount,
  maxScore,
  scoring,
  hasPendingPointChanges,
  savingPoints,
  onSavePoints,
}: ScoringSummaryBarProps) {
  return (
    <div className="rounded-md border bg-muted/20 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        {scoring.hasMinimumCases ? (
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        )}
        <span>
          {!scoring.hasMinimumCases
            ? `At least ${MIN_EVALUATION_TEST_CASES} distinct evaluation test cases required (currently ${testCount}).`
            : scoring.hasCustomPoints
              ? `Custom scoring: ${scoring.customPointsSum} / ${maxScore} points assigned across ${testCount} cases.`
              : `Auto-distribution: ${maxScore} max points distributed evenly (~${scoring.autoPointPerTest} pts per case).`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {hasPendingPointChanges && (
          <Button
            type="button"
            size="sm"
            onClick={onSavePoints}
            disabled={savingPoints}
            className="h-7 text-xs gap-1.5"
          >
            {savingPoints && <Loader2 className="h-3 w-3 animate-spin" />}
            Save Points Distribution
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground font-mono">
          Problem Max Score: {maxScore} pts
        </span>
      </div>
    </div>
  );
}
