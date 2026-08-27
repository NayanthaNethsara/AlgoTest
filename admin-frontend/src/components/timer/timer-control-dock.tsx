"use client";

import { useState } from "react";
import { CONTEST_STATUS, type ContestState } from "@/types/contest";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  Snowflake,
  StopCircle,
  Volume2,
  VolumeX,
} from "lucide-react";

interface TimerControlDockProps {
  contestState: ContestState;
  isLoading: boolean;
  isProjectorFullscreen: boolean;
  isCleanMode: boolean;
  isAudioEnabled: boolean;
  lastSyncedAt: Date | null;
  onStartContest: (durationMinutes?: number) => Promise<void>;
  onPauseContest: () => Promise<void>;
  onResumeContest: () => Promise<void>;
  onExtendContest: (minutes: number) => Promise<void>;
  onFreezeContest: () => Promise<void>;
  onUnfreezeContest: () => Promise<void>;
  onOpenEndConfirm: () => void;
  onOpenResetConfirm: () => void;
  onOpenSettings: () => void;
  onToggleFullscreen: () => void;
  onToggleCleanMode: () => void;
  onToggleAudio: () => void;
}

export function TimerControlDock({
  contestState,
  isLoading,
  isProjectorFullscreen,
  isCleanMode,
  isAudioEnabled,
  lastSyncedAt,
  onStartContest,
  onPauseContest,
  onResumeContest,
  onExtendContest,
  onFreezeContest,
  onUnfreezeContest,
  onOpenEndConfirm,
  onOpenResetConfirm,
  onOpenSettings,
  onToggleFullscreen,
  onToggleCleanMode,
  onToggleAudio,
}: TimerControlDockProps) {
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [startDurationInput, setStartDurationInput] = useState("120");
  const [customExtendOpen, setCustomExtendOpen] = useState(false);
  const [customExtendMinutes, setCustomExtendMinutes] = useState("15");

  const isRunning = contestState.status === CONTEST_STATUS.RUNNING;
  const isPaused = contestState.status === CONTEST_STATUS.PAUSED;
  const isNotStarted = contestState.status === CONTEST_STATUS.NOT_STARTED;
  const isEnded = contestState.status === CONTEST_STATUS.ENDED;
  const isFrozen = contestState.isFrozen;

  async function handleConfirmStart() {
    const dur = parseInt(startDurationInput, 10);
    setStartModalOpen(false);
    await onStartContest(isNaN(dur) || dur <= 0 ? undefined : dur);
  }

  async function handleConfirmCustomExtend() {
    const mins = parseInt(customExtendMinutes, 10);
    if (!isNaN(mins) && mins > 0) {
      setCustomExtendOpen(false);
      await onExtendContest(mins);
    }
  }

  return (
    <>
      {/* If Clean Mode is active, show only a discreet floating restore button on hover */}
      {isCleanMode ? (
        <div className="fixed bottom-4 right-4 z-50 transition-opacity duration-300 opacity-20 hover:opacity-100">
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleCleanMode}
            className="gap-2 bg-black/80 border-white/20 text-xs backdrop-blur-md hover:bg-black/95 text-foreground shadow-2xl"
          >
            <Eye className="h-4 w-4" />
            <span>Show Dock</span>
          </Button>
        </div>
      ) : (
        <div className="w-full max-w-5xl px-4 mt-6">
          <div className="rounded-2xl border border-white/10 bg-card/70 backdrop-blur-2xl p-3 sm:p-4 shadow-2xl flex flex-col gap-3">
            {/* Top Toolbar Row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-white/10">
              {/* Live Sync Status */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Radio className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[11px] hidden sm:inline">Real-Time Sync</span>
                {lastSyncedAt && (
                  <span className="text-[10px] text-muted-foreground/80">
                    ({lastSyncedAt.toLocaleTimeString([], { hour12: false })})
                  </span>
                )}
              </div>

              {/* Auxiliary Toggles (Audio, Fullscreen, Clean Mode) */}
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onToggleAudio}
                  className={`h-8 gap-1.5 text-xs border-white/10 ${
                    isAudioEnabled
                      ? "text-emerald-400 bg-emerald-950/20 border-emerald-500/30"
                      : "text-muted-foreground bg-white/5"
                  }`}
                  title={isAudioEnabled ? "Mute Timer Audio" : "Enable Timer Audio"}
                >
                  {isAudioEnabled ? (
                    <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {isAudioEnabled ? "Audio On" : "Audio Muted"}
                  </span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={onToggleCleanMode}
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-white/10 bg-white/5"
                  title="Hide controls for clean projector display"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Clean View</span>
                </Button>

                <Button
                  size="sm"
                  variant="default"
                  onClick={onToggleFullscreen}
                  className="h-8 gap-1.5 text-xs font-semibold bg-primary text-primary-foreground shadow-sm"
                  title={isProjectorFullscreen ? "Exit Fullscreen" : "Enter Projector Fullscreen (F)"}
                >
                  {isProjectorFullscreen ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" />
                      <span>Exit Fullscreen</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>Fullscreen Projector</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Primary Action Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Primary Lifecycle Actions (Start, Pause, Resume, End) */}
              <div className="flex flex-wrap items-center gap-2">
                {isNotStarted && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="default"
                      onClick={() => setStartModalOpen(true)}
                      disabled={isLoading}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-5 py-2 shadow-lg shadow-emerald-950/40"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 fill-current" />
                      )}
                      <span>Start Contest</span>
                    </Button>
                  </div>
                )}

                {isRunning && (
                  <Button
                    size="default"
                    variant="outline"
                    onClick={onPauseContest}
                    disabled={isLoading}
                    className="gap-2 text-amber-400 border-amber-500/40 bg-amber-950/20 hover:bg-amber-950/40 font-semibold text-sm px-4"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                    <span>Pause Contest</span>
                  </Button>
                )}

                {isPaused && (
                  <Button
                    size="default"
                    onClick={onResumeContest}
                    disabled={isLoading}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-5 py-2 shadow-lg shadow-emerald-950/40"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    <span>Resume Contest</span>
                  </Button>
                )}

                {/* Scoreboard Freeze Toggle */}
                {(isRunning || isPaused) && (
                  isFrozen ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onUnfreezeContest}
                      disabled={isLoading}
                      className="gap-1.5 bg-sky-500/20 text-sky-300 border-sky-400/50 hover:bg-sky-500/30 text-xs font-semibold h-9"
                      title="Unfreeze scoreboard standings"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Snowflake className="h-3.5 w-3.5 animate-pulse" />
                      )}
                      <span>Unfreeze Scoreboard</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onFreezeContest}
                      disabled={isLoading}
                      className="gap-1.5 text-sky-400 border-sky-400/40 bg-sky-950/20 hover:bg-sky-950/40 text-xs font-semibold h-9"
                      title="Freeze scoreboard standings"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Snowflake className="h-3.5 w-3.5" />
                      )}
                      <span>Freeze Scoreboard</span>
                    </Button>
                  )
                )}

                {/* End Contest Button */}
                {(isRunning || isPaused) && (
                  <Button
                    size="default"
                    variant="destructive"
                    onClick={onOpenEndConfirm}
                    disabled={isLoading}
                    className="gap-2 font-bold text-sm px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-md shadow-destructive/20"
                  >
                    <StopCircle className="h-4 w-4" />
                    <span>End Contest</span>
                  </Button>
                )}
              </div>

              {/* Time Extension Shortcuts (+5m, +10m, +15m, +30m, Custom) */}
              {(isRunning || isPaused || isEnded) && (
                <div className="flex flex-wrap items-center gap-1.5 border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-3">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground mr-1">
                    Add Time:
                  </span>
                  {[5, 10, 15, 30, 60].map((mins) => (
                    <Button
                      key={mins}
                      size="sm"
                      variant="outline"
                      onClick={() => onExtendContest(mins)}
                      disabled={isLoading}
                      className="h-8 px-2.5 text-xs font-mono font-semibold border-white/15 bg-white/5 hover:border-emerald-500 hover:text-emerald-400 hover:bg-emerald-950/20 transition-all"
                    >
                      +{mins}m
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCustomExtendOpen(true)}
                    disabled={isLoading}
                    className="h-8 px-2 text-xs font-mono border-white/15 bg-white/5 hover:border-primary"
                    title="Custom extension minutes"
                  >
                    <Plus className="h-3 w-3 mr-0.5" />
                    Custom
                  </Button>
                </div>
              )}

              {/* Maintenance Actions (Settings, Reset) */}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onOpenSettings}
                  disabled={isLoading}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  title="Configure Contest Title and Duration"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Settings</span>
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onOpenResetConfirm}
                  disabled={isLoading}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  title="Reset contest lifecycle back to NOT_STARTED"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Reset</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Contest Modal with Duration Selector */}
      <Dialog open={startModalOpen} onOpenChange={setStartModalOpen}>
        <DialogContent className="max-w-md bg-card/95 border-white/10 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              Start Contest Timer
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-3">
            <p className="text-xs text-muted-foreground">
              Starting the contest will unlock challenge access and start the countdown timer immediately for all competitors.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Contest Duration (Minutes)
              </label>
              <Input
                type="number"
                value={startDurationInput}
                onChange={(e) => setStartDurationInput(e.target.value)}
                min={1}
                className="text-sm font-mono"
              />
            </div>

            {/* Quick Duration Presets */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "1 Hour", mins: "60" },
                { label: "1.5 Hours", mins: "90" },
                { label: "2 Hours", mins: "120" },
                { label: "2.5 Hours", mins: "150" },
                { label: "3 Hours", mins: "180" },
                { label: "4 Hours", mins: "240" },
              ].map((preset) => (
                <Button
                  key={preset.mins}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setStartDurationInput(preset.mins)}
                  className={`h-7 px-2 text-xs font-mono ${
                    startDurationInput === preset.mins
                      ? "border-emerald-500 text-emerald-400 bg-emerald-950/20"
                      : "border-white/10"
                  }`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStartModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmStart}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Play className="h-3.5 w-3.5 fill-current mr-1.5" />}
              Start Contest Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Extend Minutes Modal */}
      <Dialog open={customExtendOpen} onOpenChange={setCustomExtendOpen}>
        <DialogContent className="max-w-xs bg-card/95 border-white/10 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              Add More Time
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <label className="text-xs font-semibold text-foreground">
              Minutes to Add
            </label>
            <Input
              type="number"
              value={customExtendMinutes}
              onChange={(e) => setCustomExtendMinutes(e.target.value)}
              min={1}
              autoFocus
              className="text-sm font-mono"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomExtendOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmCustomExtend}
              disabled={isLoading}
              className="bg-primary text-primary-foreground font-bold"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Extend Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
