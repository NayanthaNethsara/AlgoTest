"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  endContestAction,
  extendContestAction,
  freezeContestAction,
  getAdminContestStateAction,
  pauseContestAction,
  resetContestAction,
  resumeContestAction,
  startContestAction,
  unfreezeContestAction,
  updateContestSettingsAction,
} from "@/lib/actions/contest";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CONTEST_STATUS, type ContestState } from "@/types/contest";
import { CountdownDisplay } from "./countdown-display";
import { TimerControlDock } from "./timer-control-dock";
import {
  playContestEndSound,
  playContestStartSound,
  playContestWarningSound,
} from "./timer-audio";
import { Loader2 } from "lucide-react";

interface ContestTimerClientProps {
  initialContestState: ContestState;
}

export function ContestTimerClient({ initialContestState }: ContestTimerClientProps) {
  const [state, setState] = useState<ContestState>(initialContestState);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    initialContestState.remainingSeconds,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(
    initialContestState.elapsedSeconds,
  );
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(new Date());

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCleanMode, setIsCleanMode] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [settingsTitle, setSettingsTitle] = useState(initialContestState.title);
  const [settingsDuration, setSettingsDuration] = useState(
    String(Math.floor(initialContestState.durationSeconds / 60)),
  );
  const [settingsFreeze, setSettingsFreeze] = useState(
    String(initialContestState.freezeMinutes),
  );
  const [settingsFullscreen, setSettingsFullscreen] = useState(
    Boolean(initialContestState.requireFullscreen),
  );
  const [settingsMinVersion, setSettingsMinVersion] = useState(
    initialContestState.minClientVersion || "0.2.0",
  );
  const [settingsEnforceHash, setSettingsEnforceHash] = useState(
    Boolean(initialContestState.enforceBinaryHash),
  );
  const [settingsAuthorizedHashes, setSettingsAuthorizedHashes] = useState(
    initialContestState.authorizedBinaryHashes || "",
  );

  const stateRef = useRef(state);
  const clockOffsetRef = useRef(clockOffset);
  const previousRemainingRef = useRef(remainingSeconds);
  const isAudioEnabledRef = useRef(isAudioEnabled);

  useEffect(() => {
    stateRef.current = state;
    clockOffsetRef.current = clockOffset;
    isAudioEnabledRef.current = isAudioEnabled;
  });

  // Calculate clock offset on mount
  useEffect(() => {
    if (initialContestState.serverTime) {
      const offset = new Date(initialContestState.serverTime).getTime() - Date.now();
      setClockOffset(offset);
      clockOffsetRef.current = offset;
    }
  }, [initialContestState.serverTime]);

  // Server state sync function
  const syncServerState = useCallback(async () => {
    try {
      const data = await getAdminContestStateAction();
      setState(data);
      setLastSyncedAt(new Date());

      if (data.serverTime) {
        const offset = new Date(data.serverTime).getTime() - Date.now();
        setClockOffset(offset);
        clockOffsetRef.current = offset;
      }
      setSettingsFullscreen(Boolean(data.requireFullscreen));
      setSettingsMinVersion(data.minClientVersion || "0.2.0");
      setSettingsEnforceHash(Boolean(data.enforceBinaryHash));
      setSettingsAuthorizedHashes(data.authorizedBinaryHashes || "");
    } catch (err: unknown) {
      console.error("Contest timer synchronization error:", err);
    }
  }, []);

  // 1-second auto-poll for real-time synchronization across admins
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncServerState();
      }
    }, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncServerState();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [syncServerState]);

  // High-precision 1-second tick loop for local countdown and audio alerts
  useEffect(() => {
    const tick = () => {
      const current = stateRef.current;
      if (!current) return;

      const offset = clockOffsetRef.current;
      const now = Date.now() + offset;

      let calculatedRemaining = 0;
      let calculatedElapsed = 0;

      switch (current.status) {
        case CONTEST_STATUS.NOT_STARTED: {
          calculatedRemaining = current.durationSeconds;
          calculatedElapsed = 0;
          break;
        }

        case CONTEST_STATUS.RUNNING: {
          if (current.startTime && current.endTime) {
            const startMs = new Date(current.startTime).getTime();
            const endMs = new Date(current.endTime).getTime();

            if (now >= endMs) {
              calculatedRemaining = 0;
              calculatedElapsed = current.durationSeconds;
            } else {
              calculatedRemaining = Math.max(0, Math.floor((endMs - now) / 1000));
              calculatedElapsed = Math.max(0, Math.floor((now - startMs) / 1000));
            }
          } else {
            calculatedRemaining = current.durationSeconds;
            calculatedElapsed = 0;
          }
          break;
        }

        case CONTEST_STATUS.PAUSED: {
          calculatedRemaining = current.remainingSeconds;
          calculatedElapsed = current.elapsedSeconds;
          break;
        }

        case CONTEST_STATUS.ENDED: {
          calculatedRemaining = 0;
          calculatedElapsed = current.durationSeconds;
          break;
        }
      }

      setRemainingSeconds(calculatedRemaining);
      setElapsedSeconds(calculatedElapsed);

      // Check audio alerts
      if (isAudioEnabledRef.current && current.status === CONTEST_STATUS.RUNNING) {
        const prev = previousRemainingRef.current;

        // 5-minute warning sound
        if (prev > 300 && calculatedRemaining <= 300 && calculatedRemaining > 295) {
          playContestWarningSound("fiveMin");
        }

        // 1-minute warning sound
        if (prev > 60 && calculatedRemaining <= 60 && calculatedRemaining > 55) {
          playContestWarningSound("oneMin");
        }

        // Final buzzer sound
        if (prev > 0 && calculatedRemaining === 0) {
          playContestEndSound();
        }
      }

      previousRemainingRef.current = calculatedRemaining;
    };

    tick();
    const tickInterval = setInterval(tick, 1000);
    return () => clearInterval(tickInterval);
  }, []);

  // Track browser fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Toggle fullscreen handler
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen().catch(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if focused in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setIsCleanMode((prev) => !prev);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setIsAudioEnabled((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleFullscreen]);

  // Action dispatcher
  async function executeAction<T>(actionFn: () => Promise<T>, onCompleteSound?: () => void) {
    setIsLoading(true);
    try {
      await actionFn();
      if (isAudioEnabled && onCompleteSound) {
        onCompleteSound();
      }
      await syncServerState();
    } catch (err: unknown) {
      console.error("Action execution failed:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStartContest(durationMinutes?: number) {
    await executeAction(() => startContestAction(durationMinutes), playContestStartSound);
  }

  async function handlePauseContest() {
    await executeAction(() => pauseContestAction());
  }

  async function handleResumeContest() {
    await executeAction(() => resumeContestAction(), playContestStartSound);
  }

  async function handleExtendContest(minutes: number) {
    await executeAction(() => extendContestAction(minutes));
  }

  async function handleFreezeContest() {
    await executeAction(() => freezeContestAction());
  }

  async function handleUnfreezeContest() {
    await executeAction(() => unfreezeContestAction());
  }

  async function handleEndContest() {
    setEndConfirmOpen(false);
    await executeAction(() => endContestAction(), playContestEndSound);
  }

  async function handleResetContest() {
    setResetConfirmOpen(false);
    await executeAction(() => resetContestAction());
  }

  async function handleSaveSettings() {
    setIsLoading(true);
    try {
      const dur = parseInt(settingsDuration, 10);
      const freeze = parseInt(settingsFreeze, 10);
      await updateContestSettingsAction({
        title: settingsTitle,
        durationMinutes: isNaN(dur) ? undefined : dur,
        freezeMinutes: isNaN(freeze) ? undefined : freeze,
        requireFullscreen: settingsFullscreen,
        minClientVersion: settingsMinVersion,
        enforceBinaryHash: settingsEnforceHash,
        authorizedBinaryHashes: settingsAuthorizedHashes,
      });
      setSettingsOpen(false);
      await syncServerState();
    } catch (err: unknown) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center justify-between p-4 sm:p-8 transition-colors duration-500 ${
        isFullscreen
          ? "fixed inset-0 z-50 bg-background overflow-y-auto"
          : "relative bg-background/50"
      }`}
    >
      {/* Top spacer / header */}
      <div className="w-full flex justify-end" />

      {/* Main Digital Clock Hero View */}
      <div className="w-full flex-1 flex flex-col items-center justify-center py-6">
        <CountdownDisplay
          contestState={state}
          remainingSeconds={remainingSeconds}
          elapsedSeconds={elapsedSeconds}
          isProjectorFullscreen={isFullscreen}
        />
      </div>

      {/* Projector Control Dock */}
      <TimerControlDock
        contestState={state}
        isLoading={isLoading}
        isProjectorFullscreen={isFullscreen}
        isCleanMode={isCleanMode}
        isAudioEnabled={isAudioEnabled}
        lastSyncedAt={lastSyncedAt}
        onStartContest={handleStartContest}
        onPauseContest={handlePauseContest}
        onResumeContest={handleResumeContest}
        onExtendContest={handleExtendContest}
        onFreezeContest={handleFreezeContest}
        onUnfreezeContest={handleUnfreezeContest}
        onOpenEndConfirm={() => setEndConfirmOpen(true)}
        onOpenResetConfirm={() => setResetConfirmOpen(true)}
        onOpenSettings={() => {
          setSettingsTitle(state.title);
          setSettingsDuration(String(Math.floor(state.durationSeconds / 60)));
          setSettingsFreeze(String(state.freezeMinutes));
          setSettingsOpen(true);
        }}
        onToggleFullscreen={toggleFullscreen}
        onToggleCleanMode={() => setIsCleanMode((prev) => !prev)}
        onToggleAudio={() => setIsAudioEnabled((prev) => !prev)}
      />

      {/* End Contest Confirmation Dialog */}
      <ConfirmDialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="End Contest Immediately?"
        description="This will immediately end the contest, lock submissions for all teams, and sound the round conclusion."
        actionLabel="End Contest Now"
        variant="destructive"
        onConfirm={handleEndContest}
      />

      {/* Reset Contest Confirmation Dialog */}
      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Contest State?"
        description="This will reset the contest lifecycle status back to NOT_STARTED and clear start and end timestamps."
        actionLabel="Reset to Not Started"
        variant="destructive"
        onConfirm={handleResetContest}
      />

      {/* Contest Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md pixel-raised bg-card border-2 border-black shadow-[0_8px_0_#000000] rounded-none">
          <DialogHeader>
            <DialogTitle className="font-pixel-header text-xs sm:text-sm text-foreground">
              CONTEST SETTINGS
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-3 font-pixel-body">
            <div className="flex flex-col gap-1.5">
              <label className="font-pixel-header text-[9px] text-foreground">
                CONTEST TITLE
              </label>
              <Input
                value={settingsTitle}
                onChange={(e) => setSettingsTitle(e.target.value)}
                placeholder="e.g. MiniAlgothon 2026 Finals"
                className="text-xs pixel-inset bg-input border-2 border-black rounded-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-pixel-header text-[9px] text-foreground">
                TOTAL DURATION (MINUTES)
              </label>
              <Input
                type="number"
                value={settingsDuration}
                onChange={(e) => setSettingsDuration(e.target.value)}
                min={1}
                className="text-xs font-mono pixel-inset bg-input border-2 border-black rounded-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-pixel-header text-[9px] text-foreground">
                SCOREBOARD FREEZE WINDOW (MINS BEFORE END)
              </label>
              <Input
                type="number"
                value={settingsFreeze}
                onChange={(e) => setSettingsFreeze(e.target.value)}
                min={0}
                className="text-xs font-mono pixel-inset bg-input border-2 border-black rounded-none"
              />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
              <div className="flex flex-col gap-0.5">
                <label className="font-pixel-header text-[9px] text-foreground cursor-pointer" htmlFor="fullscreen-toggle">
                  REQUIRE BROWSER FULLSCREEN
                </label>
                <span className="text-[10px] text-muted-foreground">
                  Lock competitor web portal into HTML5 fullscreen mode
                </span>
              </div>
              <input
                id="fullscreen-toggle"
                type="checkbox"
                checked={settingsFullscreen}
                onChange={(e) => setSettingsFullscreen(e.target.checked)}
                className="size-4 cursor-pointer accent-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5 border-t border-border pt-3 mt-1">
              <label className="font-pixel-header text-[9px] text-foreground">
                MINIMUM CLIENT VERSION
              </label>
              <Input
                value={settingsMinVersion}
                onChange={(e) => setSettingsMinVersion(e.target.value)}
                placeholder="e.g. 0.2.0"
                className="text-xs font-mono pixel-inset bg-input border-2 border-black rounded-none"
              />
              <span className="text-[10px] text-muted-foreground">
                Clients with an older version will be blocked from enrolling.
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
              <div className="flex flex-col gap-0.5">
                <label className="font-pixel-header text-[9px] text-foreground cursor-pointer" htmlFor="enforce-hash-toggle">
                  ENFORCE BINARY RELEASE HASH
                </label>
                <span className="text-[10px] text-muted-foreground">
                  Verify client executable SHA-256 against authorized release checksums
                </span>
              </div>
              <input
                id="enforce-hash-toggle"
                type="checkbox"
                checked={settingsEnforceHash}
                onChange={(e) => setSettingsEnforceHash(e.target.checked)}
                className="size-4 cursor-pointer accent-primary"
              />
            </div>

            {settingsEnforceHash && (
              <div className="flex flex-col gap-1.5">
                <label className="font-pixel-header text-[9px] text-foreground">
                  AUTHORIZED RELEASE HASHES (SHA-256)
                </label>
                <textarea
                  value={settingsAuthorizedHashes}
                  onChange={(e) => setSettingsAuthorizedHashes(e.target.value)}
                  placeholder="Paste release checksums (comma-separated SHA-256 hex digests)..."
                  rows={3}
                  className="text-xs font-mono p-2 pixel-inset bg-input border-2 border-black rounded-none resize-none"
                />
                <span className="text-[10px] text-muted-foreground">
                  Generated automatically during GitHub Actions release builds.
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="font-pixel-header text-[10px] gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="pixel-press px-3 py-1.5 border-2 border-black bg-muted text-foreground cursor-pointer shadow-[0_2px_0_#000000]"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isLoading}
              className="pixel-press px-3.5 py-1.5 border-2 border-black bg-primary text-primary-foreground font-bold cursor-pointer shadow-[0_3px_0_#000000] flex items-center gap-1.5"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              <span>SAVE CONFIG</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
