"use client";

import { useContest } from "@/components/portal/contest-provider";
import { CONTEST_STATUS } from "@/types/contest";
import { CheckCircle2, PauseCircle, Snowflake, Timer } from "lucide-react";

export function ContestPhaseBanner() {
  const { state, startsInSeconds, formattedStartsIn, isFrozen } = useContest();

  if (state.status === CONTEST_STATUS.NOT_STARTED) {
    return (
      <div className="flex items-center justify-between border-b-2 border-border bg-primary/10 px-4 py-2 text-xs text-foreground">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold">{state.title} is not yet active.</span>
          <span className="text-muted-foreground hidden sm:inline">
            Submissions and official scoring will unlock once the contest begins.
          </span>
        </div>
        {startsInSeconds > 0 && (
          <div className="font-mono font-bold text-primary">
            Starts in {formattedStartsIn}
          </div>
        )}
      </div>
    );
  }

  if (state.status === CONTEST_STATUS.PAUSED) {
    return (
      <div className="flex items-center gap-2.5 border-b-2 border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs text-amber-500 font-medium">
        <PauseCircle className="h-4 w-4 shrink-0 animate-pulse" />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold uppercase tracking-wide">Contest Paused:</span>
          <span>
            Judges have temporarily paused the contest clock. Problem submissions are on hold.
          </span>
        </div>
      </div>
    );
  }

  if (state.status === CONTEST_STATUS.ENDED) {
    return (
      <div className="flex items-center gap-2.5 border-b-2 border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-foreground shrink-0" />
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">Contest Concluded:</span>
          <span>Submissions are closed. Official final standings are being verified.</span>
        </div>
      </div>
    );
  }

  if (isFrozen) {
    return (
      <div className="flex items-center gap-2.5 border-b-2 border-sky-400/30 bg-sky-400/10 px-4 py-1.5 text-xs text-sky-400">
        <Snowflake className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Scoreboard Freeze:</strong> Public standings are now frozen for the final {state.freezeMinutes} minutes. Your personal submissions will continue to be evaluated.
        </span>
      </div>
    );
  }

  return null;
}
