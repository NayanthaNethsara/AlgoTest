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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CONTEST_STATUS, type ContestState } from "@/types/contest";
import {
  AlertTriangle,
  Clock,
  FastForward,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Snowflake,
  StopCircle,
  Timer,
} from "lucide-react";

function pad(num: number): string {
  return num.toString().padStart(2, "0");
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function ContestControlBar() {
  const [state, setState] = useState<ContestState | null>(null);
  const [loading, setLoading] = useState(false);
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [settingsTitle, setSettingsTitle] = useState("");
  const [settingsDuration, setSettingsDuration] = useState("120");

  const stateRef = useRef(state);
  stateRef.current = state;

  const clockOffsetRef = useRef(clockOffset);
  clockOffsetRef.current = clockOffset;

  const loadState = useCallback(async () => {
    try {
      const data = await getAdminContestStateAction();
      setState(data);
      if (data.serverTime) {
        const offset = new Date(data.serverTime).getTime() - Date.now();
        setClockOffset(offset);
      }
      setSettingsTitle(data.title);
      setSettingsDuration(String(Math.floor(data.durationSeconds / 60)));
    } catch (err: unknown) {
      console.error("Failed to load contest state:", err);
    }
  }, []);

  useEffect(() => {
    void loadState();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadState();
      }
    }, 12_000);
    return () => clearInterval(interval);
  }, [loadState]);

  useEffect(() => {
    const calculateTick = () => {
      const current = stateRef.current;
      if (!current) return;
      const offset = clockOffsetRef.current;
      const now = Date.now() + offset;

      switch (current.status) {
        case CONTEST_STATUS.NOT_STARTED: {
          setRemainingSeconds(current.durationSeconds);
          break;
        }

        case CONTEST_STATUS.RUNNING: {
          if (current.endTime) {
            const endMs = new Date(current.endTime).getTime();
            const remaining = Math.max(0, Math.floor((endMs - now) / 1000));
            setRemainingSeconds(remaining);
          } else {
            setRemainingSeconds(current.durationSeconds);
          }
          break;
        }

        case CONTEST_STATUS.PAUSED: {
          setRemainingSeconds(current.remainingSeconds);
          break;
        }

        case CONTEST_STATUS.ENDED: {
          setRemainingSeconds(0);
          break;
        }
      }
    };

    calculateTick();
    const interval = setInterval(calculateTick, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction<T>(actionFn: () => Promise<T>) {
    setLoading(true);
    try {
      await actionFn();
      await loadState();
    } catch (err: unknown) {
      console.error("Contest action failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    setLoading(true);
    try {
      const dur = parseInt(settingsDuration, 10);
      await updateContestSettingsAction({
        title: settingsTitle,
        durationMinutes: isNaN(dur) ? undefined : dur,
      });
      setSettingsOpen(false);
      await loadState();
    } catch (err: unknown) {
      console.error("Failed to save settings:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!state) return null;

  const isRunning = state.status === CONTEST_STATUS.RUNNING;
  const isPaused = state.status === CONTEST_STATUS.PAUSED;
  const isNotStarted = state.status === CONTEST_STATUS.NOT_STARTED;
  const isEnded = state.status === CONTEST_STATUS.ENDED;
  const isFrozen = state.isFrozen;

  return (
    <div className="border-b border-white/10 bg-card/60 backdrop-blur-md px-4 sm:px-6 py-2">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground">
              {state.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isNotStarted && (
              <Badge variant="outline" className="text-[11px] font-semibold text-muted-foreground border-white/15 bg-white/5">
                NOT STARTED
              </Badge>
            )}

            {isRunning && (
              <Badge className="bg-success text-success-foreground text-[11px] font-semibold">
                RUNNING
              </Badge>
            )}

            {isPaused && (
              <Badge className="bg-amber-500 text-black text-[11px] font-semibold animate-pulse">
                PAUSED
              </Badge>
            )}

            {isEnded && (
              <Badge variant="outline" className="text-[11px] font-semibold text-destructive border-destructive/30 bg-destructive/10">
                ENDED
              </Badge>
            )}

            {isFrozen && (
              <Badge variant="outline" className="gap-1 border-sky-400/40 bg-sky-400/10 text-sky-400 text-[10px] px-1.5 py-0 h-5 font-semibold">
                <Snowflake className="h-2.5 w-2.5" />
                <span>Frozen</span>
              </Badge>
            )}

            <div className="flex items-center gap-1.5 rounded bg-black/40 border border-white/10 px-2 py-0.5 font-mono text-xs font-bold text-foreground">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span>{formatDuration(remainingSeconds)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isNotStarted && (
            <Button
              size="sm"
              onClick={() => handleAction(() => startContestAction())}
              disabled={loading}
              className="gap-1.5 bg-primary text-primary-foreground h-7.5 text-xs font-semibold"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
              <span>Start Contest</span>
            </Button>
          )}

          {isRunning && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction(() => pauseContestAction())}
              disabled={loading}
              className="gap-1.5 text-amber-400 border-amber-400/40 hover:bg-amber-400/10 h-7.5 text-xs font-medium"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
              <span>Pause</span>
            </Button>
          )}

          {isPaused && (
            <Button
              size="sm"
              onClick={() => handleAction(() => resumeContestAction())}
              disabled={loading}
              className="gap-1.5 bg-success text-success-foreground hover:bg-success/90 h-7.5 text-xs font-semibold"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
              <span>Resume</span>
            </Button>
          )}

          {(isRunning || isPaused) && (
            isFrozen ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction(() => unfreezeContestAction())}
                disabled={loading}
                className="gap-1.5 bg-sky-500/15 text-sky-300 border-sky-400/50 hover:bg-sky-500/25 h-7.5 text-xs font-semibold"
                title="Unfreeze Scoreboard to show live scores"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Snowflake className="h-3 w-3 animate-pulse" />}
                <span>Unfreeze</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction(() => freezeContestAction())}
                disabled={loading}
                className="gap-1.5 text-sky-400 border-sky-400/40 hover:bg-sky-400/10 h-7.5 text-xs font-medium"
                title="Freeze Scoreboard at current scores"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Snowflake className="h-3 w-3" />}
                <span>Freeze</span>
              </Button>
            )
          )}

          {(isRunning || isPaused || isEnded) && (
            <div className="flex items-center gap-1 border-l border-white/10 pl-2">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold hidden lg:inline mr-1">
                Extend:
              </span>
              {[5, 10, 15, 30].map((mins) => (
                <Button
                  key={mins}
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(() => extendContestAction(mins))}
                  disabled={loading}
                  className="h-7 px-2 text-[11px] font-mono hover:border-primary hover:text-primary transition-colors"
                >
                  +{mins}m
                </Button>
              ))}
            </div>
          )}

          {(isRunning || isPaused) && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setEndConfirmOpen(true)}
              disabled={loading}
              className="h-7.5 text-xs gap-1 font-medium ml-1"
            >
              <StopCircle className="h-3 w-3" />
              <span>End</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setResetConfirmOpen(true)}
            disabled={loading}
            className="h-7.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1 ml-1"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
            disabled={loading}
            className="h-7.5 px-2 text-muted-foreground hover:text-foreground"
            aria-label="Contest Settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="End Contest Immediately?"
        description="This will immediately set the contest state to ENDED, closing problem submissions for all competitors."
        actionLabel="End Contest"
        variant="destructive"
        onConfirm={() => handleAction(() => endContestAction())}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Contest State?"
        description="This will reset the contest status back to NOT_STARTED and clear start/end timestamps."
        actionLabel="Reset to Not Started"
        variant="destructive"
        onConfirm={() => handleAction(() => resetContestAction())}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contest Settings</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Contest Title
              </label>
              <Input
                value={settingsTitle}
                onChange={(e) => setSettingsTitle(e.target.value)}
                placeholder="e.g. MiniAlgothon 2026 Finals"
                className="text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Duration (Minutes)
              </label>
              <Input
                type="number"
                value={settingsDuration}
                onChange={(e) => setSettingsDuration(e.target.value)}
                min={1}
                className="text-xs font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSettings}
              disabled={loading}
              className="bg-primary text-primary-foreground font-semibold"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
