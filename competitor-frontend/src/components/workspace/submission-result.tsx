"use client";

import { AlertCircle, Check, Loader2, TrendingUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SubmitResult } from "@/types/code";

const VERDICT_DETAILS: Record<string, { label: string; style: string }> = {
  AC: { label: "ACCEPTED (AC)", style: "bg-emerald-950 text-emerald-300 border-emerald-500" },
  WA: { label: "WRONG ANSWER (WA)", style: "bg-rose-950 text-rose-300 border-rose-500" },
  TLE: { label: "TIME LIMIT EXCEEDED (TLE)", style: "bg-amber-950 text-amber-300 border-amber-500" },
  RTE: { label: "RUNTIME ERROR (RTE)", style: "bg-rose-950 text-rose-300 border-rose-500" },
  CE: { label: "COMPILATION ERROR (CE)", style: "bg-rose-950 text-rose-300 border-rose-500" },
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
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-xs font-pixel-body text-muted-foreground uppercase">
        <Loader2 className="size-6 pixel-spin text-primary" />
        <span>{statusMessage || "SUBMITTING TO EVALUATION QUEUE..."}</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-4 text-xs font-pixel-body text-muted-foreground uppercase">
        SUBMIT CODE TO EVALUATE AGAINST HIDDEN CONTEST TEST CASES.
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-4 font-pixel-body">
        <div className="flex items-start gap-3 border-2 border-black bg-destructive/30 p-4 text-destructive shadow-[inset_2px_2px_0px_#000000]">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1 text-xs uppercase">
            <span className="font-bold">SUBMISSION ERROR</span>
            <span>{result.error}</span>
          </div>
        </div>
      </div>
    );
  }

  const overallVerdict = result.verdict ? VERDICT_DETAILS[result.verdict] : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 pb-16 font-pixel-body">
      <div className="flex items-center justify-between border-2 border-black bg-card p-4 shadow-[inset_2px_2px_0px_oklch(0.45_0.02_260),0px_3px_0px_#000000]">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            TOTAL SCORE
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-bold font-pixel-header text-amber-400">
              {result.score}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {result.maxScore} XP
              </span>
            </span>
            {overallVerdict && (
              <Badge variant="outline" className={`text-[10px] font-bold uppercase border ${overallVerdict.style}`}>
                {overallVerdict.label}
              </Badge>
            )}
          </div>
        </div>
        {result.improvedBest ? (
          <Badge className="bg-emerald-950 text-emerald-300 border-emerald-500 font-bold text-[10px] uppercase">
            <TrendingUp className="size-3" />
            NEW BEST!
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground uppercase font-bold">
            BEST: {result.previousBest} XP
          </span>
        )}
      </div>

      {result.compileError && (
        <div className="border-2 border-black bg-rose-950 p-3 text-xs font-mono text-rose-300">
          <span className="font-bold font-pixel-body text-rose-400 uppercase">COMPILATION ERROR:</span>
          <pre className="mt-1 whitespace-pre-wrap">{result.compileError}</pre>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          TEST CASE EVALUATION BREAKDOWN
        </span>
        {result.subtasks.map((subtask) => {
          const vDetails = subtask.verdict ? VERDICT_DETAILS[subtask.verdict] : null;
          return (
            <div
              key={subtask.id}
              className="flex items-center justify-between gap-3 border-2 border-black bg-card/80 p-3 shadow-[inset_1px_1px_0px_#000000]"
            >
              <div className="flex items-center gap-3">
                <StatusIcon passed={subtask.passed} />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase">TEST #{subtask.id}</span>
                    {vDetails && (
                      <Badge variant="outline" className={`text-[9px] py-0 px-1.5 uppercase border ${vDetails.style}`}>
                        {vDetails.label}
                      </Badge>
                    )}
                  </div>
                  {typeof subtask.timeMs === "number" && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      TIME: {subtask.timeMs}ms
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`font-pixel-body text-xs font-bold ${
                  subtask.passed ? "text-emerald-400" : "text-muted-foreground"
                }`}
              >
                {subtask.earned}/{subtask.points} XP
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
    <span className="flex size-5 items-center justify-center border border-black bg-emerald-500 text-black font-bold text-xs">
      <Check className="size-3.5 stroke-[3]" />
    </span>
  ) : (
    <span className="flex size-5 items-center justify-center border border-black bg-rose-500 text-white font-bold text-xs">
      <X className="size-3.5 stroke-[3]" />
    </span>
  );
}
