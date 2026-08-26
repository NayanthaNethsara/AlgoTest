"use client";

import { useContest } from "@/components/portal/contest-provider";
import { Badge } from "@/components/ui/badge";
import { CONTEST_STATUS } from "@/types/contest";
import {
  AlertTriangle,
  Clock,
  PauseCircle,
  Snowflake,
  Timer,
} from "lucide-react";

export function ContestTimer() {
  const {
    state,
    remainingSeconds,
    startsInSeconds,
    isWarning,
    isCritical,
    isFrozen,
    formattedRemaining,
    formattedStartsIn,
  } = useContest();

  if (state.status === CONTEST_STATUS.NOT_STARTED) {
    return (
      <div className="flex items-center gap-1.5 pixel-flat bg-muted px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs text-muted-foreground shrink-0">
        <Timer className="h-3.5 w-3.5 text-primary" />
        {startsInSeconds > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="font-semibold uppercase text-[10px] tracking-wider text-primary hidden sm:inline">
              Starts In
            </span>
            <span className="font-mono font-bold text-foreground">
              {formattedStartsIn}
            </span>
          </div>
        ) : (
          <span className="font-semibold uppercase text-[11px] tracking-wide text-muted-foreground">
            <span className="hidden sm:inline">Contest </span>Not Started
          </span>
        )}
      </div>
    );
  }

  if (state.status === CONTEST_STATUS.PAUSED) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2 pixel-flat bg-amber-500/10 border-amber-500/30 px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs text-amber-500 shrink-0">
        <PauseCircle className="h-3.5 w-3.5 animate-pulse" />
        <span className="font-bold uppercase text-[11px] tracking-wider">
          Paused
        </span>
        <span className="font-mono font-semibold text-amber-400">
          ({formattedRemaining})
        </span>
      </div>
    );
  }

  if (state.status === CONTEST_STATUS.ENDED || remainingSeconds === 0) {
    return (
      <div className="flex items-center gap-1.5 pixel-flat bg-muted px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs text-muted-foreground shrink-0">
        <Clock className="h-3.5 w-3.5" />
        <span className="font-semibold uppercase text-[11px] tracking-wide">
          <span className="hidden sm:inline">Contest </span>Ended
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 pixel-flat px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs transition-colors shrink-0 ${
        isCritical
          ? "border-destructive/60 bg-destructive/15 text-destructive animate-pulse"
          : isWarning
            ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
            : "bg-muted text-foreground"
      }`}
    >
      {isCritical ? (
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
      ) : (
        <Clock
          className={`h-3.5 w-3.5 ${isWarning ? "text-amber-400" : "text-primary"}`}
        />
      )}

      <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
        <span>{formattedRemaining}</span>
      </div>

      {isFrozen && (
        <Badge
          variant="outline"
          className="gap-1 border-sky-400/40 bg-sky-400/10 text-sky-400 text-[10px] px-1.5 py-0 h-4.5 uppercase font-semibold"
        >
          <Snowflake className="h-2.5 w-2.5" />
          <span>Frozen</span>
        </Badge>
      )}
    </div>
  );
}
