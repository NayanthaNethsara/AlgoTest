"use client";

import { CONTEST_STATUS, type ContestState } from "@/types/contest";
import { Badge } from "@/components/ui/badge";
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
  let digitBorderClass = "border-white/10 bg-black/40 shadow-inner";
  let pulseAnimation = "";

  if (isRunning) {
    if (isCritical) {
      digitColorClass = "text-red-500 drop-shadow-[0_0_25px_rgba(239,68,68,0.5)]";
      digitBorderClass = "border-red-500/40 bg-red-950/30";
      pulseAnimation = "animate-pulse";
    } else if (isUrgent) {
      digitColorClass = "text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.35)]";
      digitBorderClass = "border-amber-500/30 bg-amber-950/20";
    } else {
      digitColorClass = "text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.3)]";
      digitBorderClass = "border-emerald-500/30 bg-emerald-950/20";
    }
  } else if (isPaused) {
    digitColorClass = "text-amber-300 drop-shadow-[0_0_15px_rgba(252,211,77,0.3)]";
    digitBorderClass = "border-amber-400/30 bg-amber-950/20";
  } else if (isEnded) {
    digitColorClass = "text-destructive/80";
    digitBorderClass = "border-destructive/20 bg-destructive/10";
  } else if (isNotStarted) {
    digitColorClass = "text-zinc-100";
    digitBorderClass = "border-white/15 bg-card/60";
  }

  return (
    <div className="w-full flex flex-col items-center justify-center select-none text-center">
      {/* Contest Title & Status Badges */}
      <div className="flex flex-col items-center gap-2.5 mb-4 sm:mb-6">
        <h1
          className={`font-black tracking-tight text-foreground transition-all duration-300 ${
            isProjectorFullscreen
              ? "text-3xl sm:text-4xl md:text-5xl lg:text-6xl"
              : "text-2xl sm:text-3xl md:text-4xl"
          }`}
        >
          {contestState.title}
        </h1>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {isNotStarted && (
            <Badge
              variant="outline"
              className="px-3 py-1 text-xs sm:text-sm font-bold border-white/20 bg-white/5 text-muted-foreground uppercase tracking-wider"
            >
              Ready to Start
            </Badge>
          )}

          {isRunning && !isUrgent && !isCritical && (
            <Badge className="px-3.5 py-1 text-xs sm:text-sm font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Contest Live</span>
            </Badge>
          )}

          {isRunning && isUrgent && (
            <Badge className="px-3.5 py-1 text-xs sm:text-sm font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
              <Clock className="h-3.5 w-3.5" />
              <span>Less than 10 Minutes Remaining</span>
            </Badge>
          )}

          {isRunning && isCritical && (
            <Badge className="px-3.5 py-1 text-xs sm:text-sm font-bold bg-red-500/30 text-red-300 border border-red-500/60 uppercase tracking-wider flex items-center gap-1.5 animate-bounce">
              <Clock className="h-3.5 w-3.5" />
              <span>Final Minute</span>
            </Badge>
          )}

          {isPaused && (
            <Badge className="px-3.5 py-1 text-xs sm:text-sm font-bold bg-amber-500/30 text-amber-300 border border-amber-500/50 uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
              <Pause className="h-3.5 w-3.5 fill-current" />
              <span>Contest Paused</span>
            </Badge>
          )}

          {isEnded && (
            <Badge className="px-3.5 py-1 text-xs sm:text-sm font-bold bg-destructive/20 text-destructive border border-destructive/40 uppercase tracking-wider flex items-center gap-1.5">
              <StopCircle className="h-3.5 w-3.5" />
              <span>Contest Concluded</span>
            </Badge>
          )}

          {isFrozen && (
            <Badge
              variant="outline"
              className="px-3 py-1 text-xs sm:text-sm font-bold border-sky-400/40 bg-sky-400/10 text-sky-300 uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(56,189,248,0.2)]"
            >
              <Snowflake className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "12s" }} />
              <span>Scoreboard Frozen</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Hero Giant Digit Countdown */}
      <div
        className={`flex items-center justify-center gap-2 sm:gap-4 md:gap-6 my-2 sm:my-4 transition-all duration-300 ${pulseAnimation}`}
      >
        {/* Hours Block */}
        <div className="flex flex-col items-center">
          <div
            className={`flex items-center justify-center rounded-xl md:rounded-2xl border ${digitBorderClass} backdrop-blur-xl transition-all duration-300 ${
              isProjectorFullscreen
                ? "h-28 w-28 sm:h-36 sm:w-36 md:h-48 md:w-48 lg:h-60 lg:w-60"
                : "h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 lg:h-48 lg:w-48"
            }`}
          >
            <span
              className={`font-mono font-black tracking-tighter ${digitColorClass} ${
                isProjectorFullscreen
                  ? "text-4xl sm:text-6xl md:text-7xl lg:text-8xl"
                  : "text-3xl sm:text-5xl md:text-6xl lg:text-7xl"
              }`}
            >
              {pad(hours)}
            </span>
          </div>
          <span className="mt-2 text-[10px] sm:text-xs md:text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">
            Hours
          </span>
        </div>

        {/* Separator Colon */}
        <div className="flex flex-col items-center justify-center pb-6">
          <span
            className={`font-mono font-black select-none ${digitColorClass} ${
              isProjectorFullscreen
                ? "text-3xl sm:text-5xl md:text-6xl lg:text-7xl"
                : "text-2xl sm:text-4xl md:text-5xl lg:text-6xl"
            }`}
          >
            :
          </span>
        </div>

        {/* Minutes Block */}
        <div className="flex flex-col items-center">
          <div
            className={`flex items-center justify-center rounded-xl md:rounded-2xl border ${digitBorderClass} backdrop-blur-xl transition-all duration-300 ${
              isProjectorFullscreen
                ? "h-28 w-28 sm:h-36 sm:w-36 md:h-48 md:w-48 lg:h-60 lg:w-60"
                : "h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 lg:h-48 lg:w-48"
            }`}
          >
            <span
              className={`font-mono font-black tracking-tighter ${digitColorClass} ${
                isProjectorFullscreen
                  ? "text-4xl sm:text-6xl md:text-7xl lg:text-8xl"
                  : "text-3xl sm:text-5xl md:text-6xl lg:text-7xl"
              }`}
            >
              {pad(minutes)}
            </span>
          </div>
          <span className="mt-2 text-[10px] sm:text-xs md:text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">
            Minutes
          </span>
        </div>

        {/* Separator Colon */}
        <div className="flex flex-col items-center justify-center pb-6">
          <span
            className={`font-mono font-black select-none ${digitColorClass} ${
              isProjectorFullscreen
                ? "text-3xl sm:text-5xl md:text-6xl lg:text-7xl"
                : "text-2xl sm:text-4xl md:text-5xl lg:text-6xl"
            }`}
          >
            :
          </span>
        </div>

        {/* Seconds Block */}
        <div className="flex flex-col items-center">
          <div
            className={`flex items-center justify-center rounded-xl md:rounded-2xl border ${digitBorderClass} backdrop-blur-xl transition-all duration-300 ${
              isProjectorFullscreen
                ? "h-28 w-28 sm:h-36 sm:w-36 md:h-48 md:w-48 lg:h-60 lg:w-60"
                : "h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 lg:h-48 lg:w-48"
            }`}
          >
            <span
              className={`font-mono font-black tracking-tighter ${digitColorClass} ${
                isProjectorFullscreen
                  ? "text-4xl sm:text-6xl md:text-7xl lg:text-8xl"
                  : "text-3xl sm:text-5xl md:text-6xl lg:text-7xl"
              }`}
            >
              {pad(seconds)}
            </span>
          </div>
          <span className="mt-2 text-[10px] sm:text-xs md:text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">
            Seconds
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-2xl sm:max-w-3xl md:max-w-4xl px-4 mt-4 sm:mt-6">
        <div className="h-2.5 sm:h-3.5 w-full rounded-full bg-black/50 border border-white/10 overflow-hidden p-0.5 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              isCritical
                ? "bg-gradient-to-r from-red-600 to-red-400"
                : isUrgent
                  ? "bg-gradient-to-r from-amber-600 to-amber-400"
                  : "bg-gradient-to-r from-emerald-600 to-teal-400"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between items-center mt-2 px-1 text-[11px] sm:text-xs font-mono text-muted-foreground">
          <span>{Math.round(progressPercent)}% Elapsed</span>
          <span>{formatTotalDurationMinutes(contestState.durationSeconds)} Total Round</span>
        </div>
      </div>

      {/* Contest Metadata Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full max-w-2xl sm:max-w-3xl md:max-w-4xl px-4 mt-4 sm:mt-6">
        {/* Elapsed Time Card */}
        <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-card/40 backdrop-blur-md px-3 py-2.5 text-left">
          <Hourglass className="h-4 w-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Elapsed
            </span>
            <span className="font-mono text-xs sm:text-sm font-bold text-foreground">
              {pad(elapsedHours)}:{pad(elapsedMinutes)}:{pad(elapsedSecs)}
            </span>
          </div>
        </div>

        {/* Total Duration Card */}
        <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-card/40 backdrop-blur-md px-3 py-2.5 text-left">
          <Clock className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Duration
            </span>
            <span className="font-mono text-xs sm:text-sm font-bold text-foreground">
              {formatTotalDurationMinutes(contestState.durationSeconds)}
            </span>
          </div>
        </div>

        {/* Start Time Card */}
        <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-card/40 backdrop-blur-md px-3 py-2.5 text-left">
          <CalendarClock className="h-4 w-4 text-sky-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Started At
            </span>
            <span className="font-mono text-xs sm:text-sm font-bold text-foreground">
              {formatClockTime(contestState.startTime)}
            </span>
          </div>
        </div>

        {/* Finish Time Card */}
        <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-card/40 backdrop-blur-md px-3 py-2.5 text-left">
          <CalendarClock className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Target End
            </span>
            <span className="font-mono text-xs sm:text-sm font-bold text-foreground">
              {formatClockTime(contestState.endTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
