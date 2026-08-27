"use client";

import { CONTEST_STATUS, type ContestState } from "@/types/contest";
import {
  CalendarClock,
  Clock,
  Hourglass,
  Pause,
  Play,
  Snowflake,
  StopCircle,
} from "lucide-react";

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
      digitBorderClass = "border-2 border-black bg-red-950/40 shadow-[inset_2px_2px_0_oklch(0.60_0.16_25),inset_-2px_-2px_0_oklch(0.27_0.09_25)]";
      pulseAnimation = "animate-pulse";
    } else if (isUrgent) {
      digitColorClass = "text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.5)]";
      digitBorderClass = "border-2 border-black bg-amber-950/30 shadow-[inset_2px_2px_0_oklch(0.65_0.14_85),inset_-2px_-2px_0_oklch(0.27_0.07_85)]";
    } else {
      digitColorClass = "text-emerald-400 drop-shadow-[0_0_18px_rgba(52,211,153,0.5)]";
      digitBorderClass = "border-2 border-black bg-[#06140d] shadow-[inset_2px_2px_0_oklch(0.42_0.08_160),inset_-2px_-2px_0_oklch(0.07_0.015_155)]";
    }
  } else if (isPaused) {
    digitColorClass = "text-amber-300 drop-shadow-[0_0_15px_rgba(252,211,77,0.4)]";
    digitBorderClass = "border-2 border-black bg-amber-950/30 shadow-[inset_2px_2px_0_oklch(0.65_0.14_85),inset_-2px_-2px_0_oklch(0.27_0.07_85)]";
  } else if (isEnded) {
    digitColorClass = "text-red-500/80";
    digitBorderClass = "border-2 border-black bg-red-950/20 shadow-[inset_2px_2px_0_#000000,inset_-2px_-2px_0_oklch(0.42_0.08_160)]";
  } else if (isNotStarted) {
    digitColorClass = "text-zinc-100";
    digitBorderClass = "border-2 border-black bg-[#0c120f] shadow-[inset_2px_2px_0_oklch(0.42_0.08_160),inset_-2px_-2px_0_oklch(0.07_0.015_155)]";
  }

  return (
    <div className="w-full flex flex-col items-center justify-center select-none text-center">
      {/* MiniAlgothon Logo Header (Large) */}
      <div className="flex flex-col items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-center justify-center pixel-raised bg-card px-6 sm:px-10 py-3 sm:py-4 shadow-[0px_4px_0px_#000000]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mini-algothon.svg"
            alt="MiniAlgothon"
            className="h-9 sm:h-12 md:h-16 lg:h-20 w-auto max-w-[85vw] sm:max-w-xl md:max-w-2xl object-contain shrink-0"
          />
        </div>

        {/* Status Badges in Pixel Flat Style */}
        <div className="flex flex-wrap items-center justify-center gap-2 font-pixel-header text-[10px] sm:text-xs">
          {isNotStarted && (
            <div className="pixel-flat bg-muted px-3 py-1 text-muted-foreground uppercase tracking-wider border-2 border-black">
              [ READY TO START ]
            </div>
          )}

          {isRunning && !isUrgent && !isCritical && (
            <div className="pixel-flat bg-emerald-950/60 text-emerald-300 border-2 border-black px-3.5 py-1 uppercase tracking-wider flex items-center gap-2 shadow-[0_2px_0_#000000]">
              <span className="h-2 w-2 rounded-none bg-emerald-400 animate-ping" />
              <Play className="h-3 w-3 fill-current" />
              <span>CONTEST LIVE</span>
            </div>
          )}

          {isRunning && isUrgent && (
            <div className="pixel-flat bg-amber-950/70 text-amber-300 border-2 border-black px-3.5 py-1 uppercase tracking-wider flex items-center gap-2 animate-pulse shadow-[0_2px_0_#000000]">
              <Clock className="h-3.5 w-3.5" />
              <span>WARNING: UNDER 10 MINS</span>
            </div>
          )}

          {isRunning && isCritical && (
            <div className="pixel-flat bg-red-950/80 text-red-300 border-2 border-black px-3.5 py-1 uppercase tracking-wider flex items-center gap-2 animate-bounce shadow-[0_2px_0_#000000]">
              <Clock className="h-3.5 w-3.5" />
              <span>FINAL MINUTE</span>
            </div>
          )}

          {isPaused && (
            <div className="pixel-flat bg-amber-950/80 text-amber-300 border-2 border-black px-3.5 py-1 uppercase tracking-wider flex items-center gap-2 animate-pulse shadow-[0_2px_0_#000000]">
              <Pause className="h-3.5 w-3.5 fill-current" />
              <span>CONTEST PAUSED</span>
            </div>
          )}

          {isEnded && (
            <div className="pixel-flat bg-red-950/60 text-red-400 border-2 border-black px-3.5 py-1 uppercase tracking-wider flex items-center gap-2 shadow-[0_2px_0_#000000]">
              <StopCircle className="h-3.5 w-3.5" />
              <span>CONTEST CONCLUDED</span>
            </div>
          )}

          {isFrozen && (
            <div className="pixel-flat bg-sky-950/60 text-sky-300 border-2 border-black px-3 py-1 uppercase tracking-wider flex items-center gap-2 shadow-[0_2px_0_#000000]">
              <Snowflake className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "10s" }} />
              <span>SCOREBOARD FROZEN</span>
            </div>
          )}
        </div>
      </div>

      {/* Hero Giant Digit Countdown in Retro Pixel Box Style */}
      <div
        className={`flex items-center justify-center gap-2 sm:gap-4 md:gap-6 my-3 sm:my-5 transition-all duration-300 ${pulseAnimation}`}
      >
        {/* Hours Block */}
        <div className="flex flex-col items-center">
          <div
            className={`flex items-center justify-center ${digitBorderClass} transition-all duration-300 relative overflow-hidden ${
              isProjectorFullscreen
                ? "h-28 w-28 sm:h-36 sm:w-36 md:h-48 md:w-48 lg:h-60 lg:w-60"
                : "h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 lg:h-48 lg:w-48"
            }`}
          >
            <div className="pixel-scanlines absolute inset-0 pointer-events-none opacity-40" />
            <span
              className={`font-pixel-header tracking-normal relative z-10 ${digitColorClass} ${
                isProjectorFullscreen
                  ? "text-2xl sm:text-4xl md:text-5xl lg:text-6xl"
                  : "text-xl sm:text-3xl md:text-4xl lg:text-5xl"
              }`}
            >
              {pad(hours)}
            </span>
          </div>
          <span className="mt-2 text-[9px] sm:text-[11px] md:text-xs font-pixel-header uppercase tracking-widest text-muted-foreground font-bold pixel-text-shadow">
            HOURS
          </span>
        </div>

        {/* Separator Colon */}
        <div className="flex flex-col items-center justify-center pb-6">
          <span
            className={`font-pixel-header select-none ${digitColorClass} ${
              isProjectorFullscreen
                ? "text-xl sm:text-3xl md:text-4xl lg:text-5xl"
                : "text-lg sm:text-2xl md:text-3xl lg:text-4xl"
            }`}
          >
            :
          </span>
        </div>

        {/* Minutes Block */}
        <div className="flex flex-col items-center">
          <div
            className={`flex items-center justify-center ${digitBorderClass} transition-all duration-300 relative overflow-hidden ${
              isProjectorFullscreen
                ? "h-28 w-28 sm:h-36 sm:w-36 md:h-48 md:w-48 lg:h-60 lg:w-60"
                : "h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 lg:h-48 lg:w-48"
            }`}
          >
            <div className="pixel-scanlines absolute inset-0 pointer-events-none opacity-40" />
            <span
              className={`font-pixel-header tracking-normal relative z-10 ${digitColorClass} ${
                isProjectorFullscreen
                  ? "text-2xl sm:text-4xl md:text-5xl lg:text-6xl"
                  : "text-xl sm:text-3xl md:text-4xl lg:text-5xl"
              }`}
            >
              {pad(minutes)}
            </span>
          </div>
          <span className="mt-2 text-[9px] sm:text-[11px] md:text-xs font-pixel-header uppercase tracking-widest text-muted-foreground font-bold pixel-text-shadow">
            MINUTES
          </span>
        </div>

        {/* Separator Colon */}
        <div className="flex flex-col items-center justify-center pb-6">
          <span
            className={`font-pixel-header select-none ${digitColorClass} ${
              isProjectorFullscreen
                ? "text-xl sm:text-3xl md:text-4xl lg:text-5xl"
                : "text-lg sm:text-2xl md:text-3xl lg:text-4xl"
            }`}
          >
            :
          </span>
        </div>

        {/* Seconds Block */}
        <div className="flex flex-col items-center">
          <div
            className={`flex items-center justify-center ${digitBorderClass} transition-all duration-300 relative overflow-hidden ${
              isProjectorFullscreen
                ? "h-28 w-28 sm:h-36 sm:w-36 md:h-48 md:w-48 lg:h-60 lg:w-60"
                : "h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 lg:h-48 lg:w-48"
            }`}
          >
            <div className="pixel-scanlines absolute inset-0 pointer-events-none opacity-40" />
            <span
              className={`font-pixel-header tracking-normal relative z-10 ${digitColorClass} ${
                isProjectorFullscreen
                  ? "text-2xl sm:text-4xl md:text-5xl lg:text-6xl"
                  : "text-xl sm:text-3xl md:text-4xl lg:text-5xl"
              }`}
            >
              {pad(seconds)}
            </span>
          </div>
          <span className="mt-2 text-[9px] sm:text-[11px] md:text-xs font-pixel-header uppercase tracking-widest text-muted-foreground font-bold pixel-text-shadow">
            SECONDS
          </span>
        </div>
      </div>

      {/* Retro Pixel Progress Bar */}
      <div className="w-full max-w-2xl sm:max-w-3xl md:max-w-4xl px-4 mt-4 sm:mt-6">
        <div className="h-4 sm:h-5 w-full border-2 border-black bg-black p-0.5 shadow-[0_3px_0_#000000]">
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

      {/* Contest Metadata Cards in Pixel Raised Style */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full max-w-2xl sm:max-w-3xl md:max-w-4xl px-4 mt-4 sm:mt-6">
        {/* Elapsed Time Card */}
        <div className="flex items-center gap-2.5 pixel-raised bg-card px-3 py-2.5 text-left">
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

        {/* Total Duration Card */}
        <div className="flex items-center gap-2.5 pixel-raised bg-card px-3 py-2.5 text-left">
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

        {/* Start Time Card */}
        <div className="flex items-center gap-2.5 pixel-raised bg-card px-3 py-2.5 text-left">
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

        {/* Finish Time Card */}
        <div className="flex items-center gap-2.5 pixel-raised bg-card px-3 py-2.5 text-left">
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
