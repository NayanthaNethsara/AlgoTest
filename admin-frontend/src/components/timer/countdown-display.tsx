"use client";

import { CONTEST_STATUS, type ContestState } from "@/types/contest";
import { CalendarClock, Clock, Hourglass, Pause, Play, Snowflake, StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountdownDisplayProps {
  contestState: ContestState;
  remainingSeconds: number;
  elapsedSeconds: number;
  isProjectorFullscreen?: boolean;
}

function pad(num: number): string {
  return num.toString().padStart(2, "0");
}

function formatClockTime(isoString?: string | null): string {
  if (!isoString) return "--:--:--";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "--:--:--";
  }
}

function formatTotalDurationMinutes(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours > 0 && remMins > 0) return `${hours}h ${remMins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function CountdownDisplay({
  contestState,
  remainingSeconds,
  elapsedSeconds,
  isProjectorFullscreen = false,
}: CountdownDisplayProps) {
  const isRunning = contestState.status === CONTEST_STATUS.RUNNING;
  const isPaused = contestState.status === CONTEST_STATUS.PAUSED;
  const isNotStarted = contestState.status === CONTEST_STATUS.NOT_STARTED;
  const isEnded = contestState.status === CONTEST_STATUS.ENDED;
  const isFrozen = contestState.isFrozen;

  // Split remaining seconds into hours, minutes, seconds
  const clampedRemaining = Math.max(0, remainingSeconds);
  const hours = Math.floor(clampedRemaining / 3600);
  const minutes = Math.floor((clampedRemaining % 3600) / 60);
  const seconds = clampedRemaining % 60;

  // Split elapsed seconds
  const clampedElapsed = Math.max(0, elapsedSeconds);
  const elapsedHours = Math.floor(clampedElapsed / 3600);
  const elapsedMinutes = Math.floor((clampedElapsed % 3600) / 60);
  const elapsedSecs = clampedElapsed % 60;

  // Calculate percentage of contest elapsed
  const totalSeconds = Math.max(1, contestState.durationSeconds);
  const progressPercent = isNotStarted
    ? 0
    : isEnded
      ? 100
      : Math.min(100, Math.max(0, (clampedElapsed / totalSeconds) * 100));

  // Determine urgency theme
  const isCritical = isRunning && clampedRemaining > 0 && clampedRemaining <= 60;
  const isUrgent = isRunning && clampedRemaining > 60 && clampedRemaining <= 600;

  let digitColorClass = "text-foreground";
  let digitBorderClass = "pixel-inset bg-[#0a0f0d]";
  let pulseAnimation = "";

  if (isRunning) {
    if (isCritical) {
      digitColorClass = "text-red-400 drop-shadow-[0_0_20px_rgba(239,68,68,0.7)]";
      digitBorderClass =
        "border-2 border-black bg-red-950/40 shadow-[inset_2px_2px_0_oklch(0.60_0.16_25),inset_-2px_-2px_0_oklch(0.27_0.09_25)]";
      pulseAnimation = "animate-pulse";
    } else if (isUrgent) {
      digitColorClass = "text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.5)]";
      digitBorderClass =
        "border-2 border-black bg-amber-950/30 shadow-[inset_2px_2px_0_oklch(0.65_0.14_85),inset_-2px_-2px_0_oklch(0.27_0.07_85)]";
    } else {
      digitColorClass = "text-emerald-400 drop-shadow-[0_0_18px_rgba(52,211,153,0.5)]";
      digitBorderClass =
        "border-2 border-black bg-[#06140d] shadow-[inset_2px_2px_0_oklch(0.42_0.08_160),inset_-2px_-2px_0_oklch(0.07_0.015_155)]";
    }
  } else if (isPaused) {
    digitColorClass = "text-amber-300 drop-shadow-[0_0_15px_rgba(252,211,77,0.4)]";
    digitBorderClass =
      "border-2 border-black bg-amber-950/30 shadow-[inset_2px_2px_0_oklch(0.65_0.14_85),inset_-2px_-2px_0_oklch(0.27_0.07_85)]";
  } else if (isEnded) {
    digitColorClass = "text-red-500/80";
    digitBorderClass =
      "border-2 border-black bg-red-950/20 shadow-[inset_2px_2px_0_#000000,inset_-2px_-2px_0_oklch(0.42_0.08_160)]";
  } else if (isNotStarted) {
    digitColorClass = "text-zinc-100";
    digitBorderClass =
      "border-2 border-black bg-[#0c120f] shadow-[inset_2px_2px_0_oklch(0.42_0.08_160),inset_-2px_-2px_0_oklch(0.07_0.015_155)]";
  }

  return (
    <div className="w-full flex flex-col items-center justify-center select-none text-center">
      {/* Top Row: Algothon Logo + Sponsor, no card styling */}
      <div
        className={cn(
          "flex flex-row flex-wrap items-center justify-center gap-3 sm:gap-5 mb-2.5 sm:mb-4",
          isProjectorFullscreen && "gap-4 sm:gap-7 mb-3 sm:mb-6"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/algothon.svg"
          alt="Algothon"
          className={cn(
            "h-[clamp(1.5rem,min(4.5vw,4.5vh),3.25rem)] w-auto max-w-[85vw] shrink-0 object-contain sm:max-w-md",
            isProjectorFullscreen && "h-[clamp(1.75rem,min(6vw,7vh),5rem)] sm:max-w-xl md:max-w-2xl"
          )}
        />

        {/* Powered By Sponsor */}
        <div
          className={cn(
            "flex items-center gap-1.5 sm:gap-2",
            isProjectorFullscreen && "gap-2 sm:gap-3"
          )}
        >
          <span
            className={cn(
              "font-pixel-header text-[9px] sm:text-[11px] uppercase tracking-widest text-muted-foreground whitespace-nowrap",
              isProjectorFullscreen && "text-xs sm:text-sm"
            )}
          >
            Powered by
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gtn-white.png"
            alt="GTN"
            className={cn(
              "h-[clamp(1.5rem,min(4.5vw,4.5vh),3.25rem)] w-auto shrink-0 object-contain",
              isProjectorFullscreen && "h-[clamp(1.75rem,min(6vw,7vh),5rem)]"
            )}
          />
        </div>
      </div>

      {/* Next Row: Status Badges in Pixel Flat Style */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 font-pixel-header text-[10px] sm:text-xs mb-2 sm:mb-3",
          isProjectorFullscreen && "mb-3 sm:mb-5"
        )}
      >
        {isNotStarted && (
          <div className="bg-muted px-3.5 py-1.5 text-muted-foreground uppercase tracking-wider">
            [ READY TO START ]
          </div>
        )}

        {isRunning && !isUrgent && !isCritical && (
          <div className="flex items-center gap-2 bg-emerald-950/60 px-3.5 py-1.5 uppercase tracking-wider text-emerald-300">
            <span className="h-2 w-2 bg-emerald-400 animate-ping" />
            <Play className="h-3 w-3 fill-current" />
            <span>CONTEST LIVE</span>
          </div>
        )}

        {isRunning && isUrgent && (
          <div className="flex items-center gap-2 bg-amber-950/70 px-3.5 py-1.5 uppercase tracking-wider text-amber-300 animate-pulse">
            <Clock className="h-3.5 w-3.5" />
            <span>WARNING: UNDER 10 MINS</span>
          </div>
        )}

        {isRunning && isCritical && (
          <div className="flex items-center gap-2 bg-red-950/80 px-3.5 py-1.5 uppercase tracking-wider text-red-300 animate-bounce">
            <Clock className="h-3.5 w-3.5" />
            <span>FINAL MINUTE</span>
          </div>
        )}

        {isPaused && (
          <div className="flex items-center gap-2 bg-amber-950/80 px-3.5 py-1.5 uppercase tracking-wider text-amber-300 animate-pulse">
            <Pause className="h-3.5 w-3.5 fill-current" />
            <span>CONTEST PAUSED</span>
          </div>
        )}

        {isEnded && (
          <div className="flex items-center gap-2 bg-red-950/60 px-3.5 py-1.5 uppercase tracking-wider text-red-400">
            <StopCircle className="h-3.5 w-3.5" />
            <span>CONTEST CONCLUDED</span>
          </div>
        )}

        {isFrozen && (
          <div className="flex items-center gap-2 bg-sky-950/60 px-3.5 py-1.5 uppercase tracking-wider text-sky-300">
            <Snowflake className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "10s" }} />
            <span>SCOREBOARD FROZEN</span>
          </div>
        )}
      </div>

      {/* Hero Giant Digit Countdown in Retro Pixel Box Style */}
      <div
        className={cn(
          "flex items-center justify-center gap-2 sm:gap-4 md:gap-6 my-2 sm:my-3 transition-all duration-300",
          pulseAnimation,
          isProjectorFullscreen && "my-3 sm:my-6"
        )}
        style={
          {
            "--digit-size": isProjectorFullscreen
              ? "clamp(4.5rem, min(13vw, 20vh), 15rem)"
              : "clamp(3.25rem, min(8.5vw, 13vh), 8.5rem)",
            "--digit-font": isProjectorFullscreen
              ? "clamp(1.25rem, min(4.2vw, 6.5vh), 3.75rem)"
              : "clamp(1rem, min(2.6vw, 3.8vh), 2.25rem)",
          } as React.CSSProperties
        }
      >
        <DigitBlock
          value={pad(hours)}
          label="HOURS"
          boxClassName={digitBorderClass}
          digitClassName={digitColorClass}
        />

        <Colon className={digitColorClass} />

        <DigitBlock
          value={pad(minutes)}
          label="MINUTES"
          boxClassName={digitBorderClass}
          digitClassName={digitColorClass}
        />

        <Colon className={digitColorClass} />

        <DigitBlock
          value={pad(seconds)}
          label="SECONDS"
          boxClassName={digitBorderClass}
          digitClassName={digitColorClass}
        />
      </div>

      {/* Retro Pixel Progress Bar */}
      <div
        className={cn(
          "w-full max-w-2xl sm:max-w-3xl md:max-w-4xl px-4 mt-2 sm:mt-3",
          isProjectorFullscreen && "mt-3 sm:mt-7"
        )}
      >
        <div className="h-3.5 sm:h-4.5 w-full border-2 border-black bg-black p-0.5 shadow-[0_2px_0_#000000]">
          <div
            className={`h-full transition-all duration-1000 ${
              isCritical
                ? "bg-red-500 shadow-[inset_1px_1px_0_oklch(0.88_0.16_25),inset_-1px_-1px_0_oklch(0.27_0.09_25)]"
                : isUrgent
                  ? "bg-amber-500 shadow-[inset_1px_1px_0_oklch(0.90_0.14_85),inset_-1px_-1px_0_oklch(0.27_0.07_85)]"
                  : "bg-emerald-500 shadow-[inset_1px_1px_0_oklch(0.88_0.14_155),inset_-1px_-1px_0_oklch(0.24_0.07_155)]"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between items-center mt-2 px-1 text-[10px] sm:text-xs font-pixel-header text-muted-foreground">
          <span>{Math.round(progressPercent)}% ELAPSED</span>
          <span>{formatTotalDurationMinutes(contestState.durationSeconds)} TOTAL</span>
        </div>
      </div>

      {/* Contest Metadata Row, no card boxes */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12 w-full max-w-2xl sm:max-w-3xl md:max-w-4xl px-4 mt-3 sm:mt-5",
          isProjectorFullscreen && "gap-x-10 sm:gap-x-16 mt-4 sm:mt-8"
        )}
      >
        {/* Elapsed Time */}
        <div className="flex items-center gap-2 text-left">
          <Hourglass className="h-4 w-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-[8px] sm:text-[9px] uppercase font-pixel-header text-muted-foreground tracking-wider">
              ELAPSED
            </span>
            <span className="font-pixel-header text-[10px] sm:text-xs font-bold text-foreground mt-0.5">
              {pad(elapsedHours)}:{pad(elapsedMinutes)}:{pad(elapsedSecs)}
            </span>
          </div>
        </div>

        {/* Total Duration */}
        <div className="flex items-center gap-2 text-left">
          <Clock className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[8px] sm:text-[9px] uppercase font-pixel-header text-muted-foreground tracking-wider">
              DURATION
            </span>
            <span className="font-pixel-header text-[10px] sm:text-xs font-bold text-foreground mt-0.5">
              {formatTotalDurationMinutes(contestState.durationSeconds)}
            </span>
          </div>
        </div>

        {/* Start Time */}
        <div className="flex items-center gap-2 text-left">
          <CalendarClock className="h-4 w-4 text-sky-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[8px] sm:text-[9px] uppercase font-pixel-header text-muted-foreground tracking-wider">
              STARTED
            </span>
            <span className="font-pixel-header text-[9px] sm:text-[10px] font-bold text-foreground mt-0.5">
              {formatClockTime(contestState.startTime)}
            </span>
          </div>
        </div>

        {/* Finish Time */}
        <div className="flex items-center gap-2 text-left">
          <CalendarClock className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[8px] sm:text-[9px] uppercase font-pixel-header text-muted-foreground tracking-wider">
              TARGET END
            </span>
            <span className="font-pixel-header text-[9px] sm:text-[10px] font-bold text-foreground mt-0.5">
              {formatClockTime(contestState.endTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One zero-padded time unit in its pixel box. */
function DigitBlock({
  value,
  label,
  boxClassName,
  digitClassName,
}: {
  value: string;
  label: string;
  boxClassName: string;
  digitClassName: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative flex size-(--digit-size) items-center justify-center overflow-hidden transition-all duration-300 ${boxClassName}`}
      >
        <div className="pixel-scanlines pointer-events-none absolute inset-0 opacity-40" />
        <span
          className={`relative z-10 font-pixel-header text-(length:--digit-font) tracking-normal ${digitClassName}`}
        >
          {value}
        </span>
      </div>
      <span className="mt-2 font-pixel-header text-[9px] font-bold tracking-widest text-muted-foreground uppercase pixel-text-shadow sm:text-[11px] md:text-xs">
        {label}
      </span>
    </div>
  );
}

function Colon({ className }: { className: string }) {
  return (
    <div className="flex flex-col items-center justify-center pb-6">
      <span
        className={`font-pixel-header text-[length:calc(var(--digit-font)*0.8)] select-none ${className}`}
      >
        :
      </span>
    </div>
  );
}
