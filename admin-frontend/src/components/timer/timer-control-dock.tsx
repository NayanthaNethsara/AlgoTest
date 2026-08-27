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
        <div className="fixed bottom-4 right-4 z-50 transition-opacity duration-300 opacity-25 hover:opacity-100">
          <Button
            size="sm"
            onClick={onToggleCleanMode}
            className="gap-2 pixel-raised bg-card text-foreground font-pixel-header text-[10px] px-3 py-2 cursor-pointer shadow-[0_4px_0_#000000]"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>SHOW DOCK</span>
          </Button>
        </div>
      ) : (
        <div className="w-full max-w-5xl px-4 mt-6">
          <div className="pixel-raised bg-card/90 p-3 sm:p-4 shadow-[0px_6px_0px_#000000] flex flex-col gap-3">
            {/* Top Toolbar Row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b-2 border-black">
              {/* Live Sync Status */}
              <div className="flex items-center gap-2 text-xs font-pixel-header text-muted-foreground">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-none h-2 w-2 bg-emerald-500" />
                </span>
                <Radio className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[9px] sm:text-[10px] hidden sm:inline">LIVE SYNC</span>
                {lastSyncedAt && (
                  <span className="text-[9px] text-muted-foreground/80 font-mono">
                    ({lastSyncedAt.toLocaleTimeString([], { hour12: false })})
                  </span>
                )}
              </div>

              {/* Auxiliary Toggles (Audio, Fullscreen, Clean Mode) */}
              <div className="flex items-center gap-1.5 font-pixel-header text-[10px]">
                <button
                  type="button"
                  onClick={onToggleAudio}
                  className={`pixel-press px-2.5 py-1.5 text-[9px] border-2 border-black flex items-center gap-1.5 cursor-pointer shadow-[0_2px_0_#000000] ${
                    isAudioEnabled
                      ? "bg-emerald-950/40 text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                  title={isAudioEnabled ? "Mute Timer Audio (M)" : "Enable Timer Audio (M)"}
                >
                  {isAudioEnabled ? (
                    <Volume2 className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <VolumeX className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline">
                    {isAudioEnabled ? "AUDIO ON" : "MUTED"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleCleanMode}
                  className="pixel-press px-2.5 py-1.5 text-[9px] border-2 border-black bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer shadow-[0_2px_0_#000000]"
                  title="Hide controls for clean projector display (C)"
                >
                  <EyeOff className="h-3 w-3" />
                  <span className="hidden sm:inline">CLEAN VIEW</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="pixel-press px-3 py-1.5 text-[9px] border-2 border-black bg-primary text-primary-foreground font-bold flex items-center gap-1.5 cursor-pointer shadow-[0_2px_0_#000000]"
                  title={isProjectorFullscreen ? "Exit Fullscreen (F)" : "Enter Projector Fullscreen (F)"}
                >
                  {isProjectorFullscreen ? (
                    <>
                      <Minimize2 className="h-3 w-3" />
                      <span>EXIT FULLSCREEN</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3 w-3" />
                      <span>FULLSCREEN (F)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Primary Action Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Primary Lifecycle Actions (Start, Pause, Resume, End) */}
              <div className="flex flex-wrap items-center gap-2 font-pixel-header text-[10px]">
                {isNotStarted && (
                  <button
                    type="button"
                    onClick={() => setStartModalOpen(true)}
                    disabled={isLoading}
                    className="pixel-press flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 border-2 border-black shadow-[0_4px_0_#000000] cursor-pointer"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    )}
                    <span>START CONTEST</span>
                  </button>
                )}

                {isRunning && (
                  <button
                    type="button"
                    onClick={onPauseContest}
                    disabled={isLoading}
                    className="pixel-press flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2 border-2 border-black shadow-[0_4px_0_#000000] cursor-pointer"
                  >
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                    <span>PAUSE CONTEST</span>
                  </button>
                )}

                {isPaused && (
                  <button
                    type="button"
                    onClick={onResumeContest}
                    disabled={isLoading}
                    className="pixel-press flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 border-2 border-black shadow-[0_4px_0_#000000] cursor-pointer"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    )}
                    <span>RESUME CONTEST</span>
                  </button>
                )}

                {/* Scoreboard Freeze Toggle */}
                {(isRunning || isPaused) && (
                  isFrozen ? (
                    <button
                      type="button"
                      onClick={onUnfreezeContest}
                      disabled={isLoading}
                      className="pixel-press flex items-center gap-1.5 bg-sky-950/60 text-sky-300 border-2 border-black px-3 py-2 text-[9px] shadow-[0_3px_0_#000000] cursor-pointer"
                      title="Unfreeze scoreboard standings"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Snowflake className="h-3 w-3 animate-pulse" />
                      )}
                      <span>UNFREEZE SCOREBOARD</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onFreezeContest}
                      disabled={isLoading}
                      className="pixel-press flex items-center gap-1.5 bg-sky-950/30 text-sky-400 border-2 border-black px-3 py-2 text-[9px] shadow-[0_3px_0_#000000] cursor-pointer"
                      title="Freeze scoreboard standings"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Snowflake className="h-3 w-3" />
                      )}
                      <span>FREEZE SCOREBOARD</span>
                    </button>
                  )
                )}

                {/* End Contest Button */}
                {(isRunning || isPaused) && (
                  <button
                    type="button"
                    onClick={onOpenEndConfirm}
                    disabled={isLoading}
                    className="pixel-press flex items-center gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold text-xs px-3.5 py-2 border-2 border-black shadow-[0_4px_0_#000000] cursor-pointer"
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    <span>END CONTEST</span>
                  </button>
                )}
              </div>

              {/* Time Extension Shortcuts (+5m, +10m, +15m, +30m, Custom) */}
              {(isRunning || isPaused || isEnded) && (
                <div className="flex flex-wrap items-center gap-1.5 border-t sm:border-t-0 sm:border-l-2 border-black pt-2 sm:pt-0 sm:pl-3 font-pixel-header text-[9px]">
                  <span className="text-muted-foreground mr-1">
                    ADD:
                  </span>
                  {[5, 10, 15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => onExtendContest(mins)}
                      disabled={isLoading}
                      className="pixel-press px-2 py-1 border-2 border-black bg-muted text-foreground hover:bg-emerald-950/40 hover:text-emerald-300 shadow-[0_2px_0_#000000] cursor-pointer"
                    >
                      +{mins}M
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomExtendOpen(true)}
                    disabled={isLoading}
                    className="pixel-press px-2 py-1 border-2 border-black bg-muted text-foreground shadow-[0_2px_0_#000000] cursor-pointer flex items-center gap-1"
                    title="Custom extension minutes"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    CUSTOM
                  </button>
                </div>
              )}

              {/* Maintenance Actions (Settings, Reset) */}
              <div className="flex items-center gap-1.5 ml-auto font-pixel-header text-[9px]">
                <button
                  type="button"
                  onClick={onOpenSettings}
                  disabled={isLoading}
                  className="pixel-press px-2 py-1 text-muted-foreground hover:text-foreground border-2 border-black bg-muted flex items-center gap-1 cursor-pointer shadow-[0_2px_0_#000000]"
                  title="Configure Contest Title and Duration"
                >
                  <Settings2 className="h-3 w-3" />
                  <span className="hidden md:inline">CONFIG</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenResetConfirm}
                  disabled={isLoading}
                  className="pixel-press px-2 py-1 text-muted-foreground hover:text-destructive border-2 border-black bg-muted flex items-center gap-1 cursor-pointer shadow-[0_2px_0_#000000]"
                  title="Reset contest lifecycle back to NOT_STARTED"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="hidden md:inline">RESET</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Contest Modal in Pixel Raised Style */}
      <Dialog open={startModalOpen} onOpenChange={setStartModalOpen}>
        <DialogContent className="max-w-md pixel-raised bg-card border-2 border-black shadow-[0_8px_0_#000000] rounded-none">
          <DialogHeader>
            <DialogTitle className="font-pixel-header text-sm text-foreground">
              START CONTEST TIMER
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-3 font-pixel-body">
            <p className="text-sm text-muted-foreground">
              Starting the contest will unlock challenge access and start the countdown timer immediately for all competitors.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="font-pixel-header text-[10px] text-foreground">
                CONTEST DURATION (MINUTES)
              </label>
              <Input
                type="number"
                value={startDurationInput}
                onChange={(e) => setStartDurationInput(e.target.value)}
                min={1}
                className="text-sm font-mono pixel-inset bg-input border-2 border-black rounded-none"
              />
            </div>

            {/* Quick Duration Presets */}
            <div className="flex flex-wrap gap-1.5 font-pixel-header text-[9px]">
              {[
                { label: "1 HR", mins: "60" },
                { label: "1.5 HRS", mins: "90" },
                { label: "2 HRS", mins: "120" },
                { label: "2.5 HRS", mins: "150" },
                { label: "3 HRS", mins: "180" },
                { label: "4 HRS", mins: "240" },
              ].map((preset) => (
                <button
                  key={preset.mins}
                  type="button"
                  onClick={() => setStartDurationInput(preset.mins)}
                  className={`pixel-press px-2 py-1 border-2 border-black cursor-pointer shadow-[0_2px_0_#000000] ${
                    startDurationInput === preset.mins
                      ? "bg-emerald-950/60 text-emerald-300 border-emerald-500"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="font-pixel-header text-[10px] gap-2">
            <button
              type="button"
              onClick={() => setStartModalOpen(false)}
              className="pixel-press px-3 py-1.5 border-2 border-black bg-muted text-foreground cursor-pointer shadow-[0_2px_0_#000000]"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleConfirmStart}
              disabled={isLoading}
              className="pixel-press px-3.5 py-1.5 border-2 border-black bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shadow-[0_3px_0_#000000] flex items-center gap-1.5"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
              <span>START NOW</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Extend Minutes Modal in Pixel Style */}
      <Dialog open={customExtendOpen} onOpenChange={setCustomExtendOpen}>
        <DialogContent className="max-w-xs pixel-raised bg-card border-2 border-black shadow-[0_8px_0_#000000] rounded-none">
          <DialogHeader>
            <DialogTitle className="font-pixel-header text-xs text-foreground">
              ADD MORE TIME
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2 font-pixel-body">
            <label className="font-pixel-header text-[9px] text-foreground">
              MINUTES TO EXTEND
            </label>
            <Input
              type="number"
              value={customExtendMinutes}
              onChange={(e) => setCustomExtendMinutes(e.target.value)}
              min={1}
              autoFocus
              className="text-sm font-mono pixel-inset bg-input border-2 border-black rounded-none"
            />
          </div>
          <DialogFooter className="font-pixel-header text-[10px] gap-2">
            <button
              type="button"
              onClick={() => setCustomExtendOpen(false)}
              className="pixel-press px-2.5 py-1 border-2 border-black bg-muted text-foreground cursor-pointer shadow-[0_2px_0_#000000]"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleConfirmCustomExtend}
              disabled={isLoading}
              className="pixel-press px-3 py-1 border-2 border-black bg-primary text-primary-foreground font-bold cursor-pointer shadow-[0_2px_0_#000000] flex items-center gap-1"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              <span>EXTEND</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
