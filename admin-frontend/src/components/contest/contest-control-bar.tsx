"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ClockIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  Settings2Icon,
  SnowflakeIcon,
  StopCircleIcon,
  TimerIcon,
} from "lucide-react";
import { toast } from "sonner";
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
import { getErrorMessage } from "@/lib/errors";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ContestSettingsDialog } from "@/components/contest/contest-settings-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONTEST_STATUS, type ContestSettingsInput, type ContestState } from "@/types/contest";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 12_000;
const EXTEND_PRESETS = [5, 15, 30];

function pad(num: number): string {
  return num.toString().padStart(2, "0");
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export function ContestControlBar() {
  const pathname = usePathname();
  const [state, setState] = useState<ContestState | null>(null);
  const [loading, setLoading] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const stateRef = useRef(state);
  const clockOffsetRef = useRef(clockOffset);

  useEffect(() => {
    stateRef.current = state;
    clockOffsetRef.current = clockOffset;
  });

  const loadState = useCallback(async () => {
    try {
      const data = await getAdminContestStateAction();
      setState(data);
      if (data.serverTime) {
        setClockOffset(new Date(data.serverTime).getTime() - Date.now());
      }
    } catch (err) {
      console.error("Failed to load contest state:", err);
    }
  }, []);

  useEffect(() => {
    void loadState();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadState();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadState]);

  useEffect(() => {
    const tick = () => {
      const current = stateRef.current;
      if (!current) return;
      const now = Date.now() + clockOffsetRef.current;

      switch (current.status) {
        case CONTEST_STATUS.NOT_STARTED:
          setRemainingSeconds(current.durationSeconds);
          break;
        case CONTEST_STATUS.RUNNING:
          setRemainingSeconds(
            current.endTime
              ? Math.max(0, Math.floor((new Date(current.endTime).getTime() - now) / 1000))
              : current.durationSeconds
          );
          break;
        case CONTEST_STATUS.PAUSED:
          setRemainingSeconds(current.remainingSeconds);
          break;
        case CONTEST_STATUS.ENDED:
          setRemainingSeconds(0);
          break;
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(actionFn: () => Promise<unknown>, successMessage: string) {
    setLoading(true);
    try {
      await actionFn();
      await loadState();
      toast.success(successMessage);
    } catch (err) {
      toast.error(getErrorMessage(err, "The contest action failed."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(input: ContestSettingsInput) {
    setLoading(true);
    try {
      await updateContestSettingsAction(input);
      setSettingsOpen(false);
      await loadState();
      toast.success("Contest settings saved");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save the contest settings."));
    } finally {
      setLoading(false);
    }
  }

  if (!state || pathname.startsWith("/timer")) return null;

  const isRunning = state.status === CONTEST_STATUS.RUNNING;
  const isPaused = state.status === CONTEST_STATUS.PAUSED;
  const isNotStarted = state.status === CONTEST_STATUS.NOT_STARTED;
  const isEnded = state.status === CONTEST_STATUS.ENDED;
  const isFrozen = state.isFrozen;
  const isLive = isRunning || isPaused;
  const canExtend = isLive || isEnded;

  function toggleFreeze() {
    if (isFrozen) {
      void handleAction(() => unfreezeContestAction(), "Scoreboard unfrozen");
    } else {
      void handleAction(() => freezeContestAction(), "Scoreboard frozen");
    }
  }

  return (
    <div className="border-b bg-card/70 px-3 py-2 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="flex min-w-0 shrink items-center gap-1.5">
            <TimerIcon className="size-3.5 shrink-0 text-primary" />
            <span className="truncate text-xs font-bold" title={state.title}>
              {state.title}
            </span>
          </span>

          <StatusBadge status={state.status} />

          {isFrozen && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="outline"
                    className="h-5 gap-1 border-sky-400/40 bg-sky-400/10 py-0 text-[10px] font-semibold text-sky-400"
                  />
                }
              >
                <SnowflakeIcon className="size-2.5" /> Frozen
              </TooltipTrigger>
              <TooltipContent>Leaderboard is frozen at its current scores</TooltipContent>
            </Tooltip>
          )}

          <span
            className="flex items-center gap-1 rounded border bg-background/60 px-2 py-0.5 font-mono text-xs font-bold tabular-nums"
            aria-label="Time remaining"
          >
            <ClockIcon className="size-3 text-muted-foreground" />
            {formatDuration(remainingSeconds)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:justify-end sm:gap-2">
          {isNotStarted && (
            <Button
              size="sm"
              onClick={() => handleAction(() => startContestAction(), "Contest started")}
              disabled={loading}
              className="gap-1.5 font-semibold"
            >
              {loading ? <Spinner /> : <PlayIcon className="fill-current" />} Start contest
            </Button>
          )}

          {isRunning && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction(() => pauseContestAction(), "Contest paused")}
              disabled={loading}
              className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
            >
              {loading ? <Spinner /> : <PauseIcon />} Pause
            </Button>
          )}

          {isPaused && (
            <Button
              size="sm"
              onClick={() => handleAction(() => resumeContestAction(), "Contest resumed")}
              disabled={loading}
              className="gap-1.5 bg-success text-background font-semibold hover:bg-success/90"
            >
              {loading ? <Spinner /> : <PlayIcon className="fill-current" />} Resume
            </Button>
          )}

          {canExtend && (
            <div className="flex items-center gap-1" role="group" aria-label="Extend contest">
              {EXTEND_PRESETS.map((mins) => (
                <Button
                  key={mins}
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    handleAction(
                      () => extendContestAction(mins),
                      `Contest extended by ${mins} minutes`
                    )
                  }
                  disabled={loading}
                  className="font-mono hover:border-primary hover:text-primary"
                >
                  +{mins}m
                </Button>
              ))}
            </div>
          )}

          {canExtend && (
            <Button
              size="sm"
              variant="outline"
              onClick={toggleFreeze}
              disabled={loading}
              className={cn(
                "hidden gap-1.5 border-sky-400/40 text-sky-400 hover:bg-sky-400/10 hover:text-sky-300 md:inline-flex",
                isFrozen && "bg-sky-500/15 text-sky-300"
              )}
            >
              {loading ? <Spinner /> : <SnowflakeIcon />} {isFrozen ? "Unfreeze" : "Freeze"}
            </Button>
          )}

          {isLive && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setEndConfirmOpen(true)}
              disabled={loading}
              className="hidden gap-1.5 md:inline-flex"
            >
              <StopCircleIcon /> End
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={loading}
                  aria-label="More contest controls"
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Contest controls</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />

              {canExtend && (
                <DropdownMenuItem onClick={toggleFreeze} className="md:hidden">
                  <SnowflakeIcon /> {isFrozen ? "Unfreeze scoreboard" : "Freeze scoreboard"}
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings2Icon /> Contest settings
              </DropdownMenuItem>

              {isLive && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setEndConfirmOpen(true)}
                  className="md:hidden"
                >
                  <StopCircleIcon /> End contest
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setResetConfirmOpen(true)}>
                <RotateCcwIcon /> Reset contest state
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ConfirmDialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="End contest now?"
        description="The contest moves to ENDED immediately and submissions close for every competitor."
        actionLabel="End contest"
        variant="destructive"
        onConfirm={() => handleAction(() => endContestAction(), "Contest ended")}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset contest state?"
        description="The status returns to NOT_STARTED and the start and end timestamps are cleared. Submissions and scores are not deleted."
        actionLabel="Reset to not started"
        variant="destructive"
        onConfirm={() => handleAction(() => resetContestAction(), "Contest reset")}
      />

      <ContestSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        state={state}
        pending={loading}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: ContestState["status"] }) {
  switch (status) {
    case CONTEST_STATUS.RUNNING:
      return (
        <Badge className="h-5 bg-success py-0 text-[10px] font-semibold text-background">
          RUNNING
        </Badge>
      );
    case CONTEST_STATUS.PAUSED:
      return (
        <Badge className="h-5 animate-pulse bg-warning py-0 text-[10px] font-semibold text-background">
          PAUSED
        </Badge>
      );
    case CONTEST_STATUS.ENDED:
      return (
        <Badge
          variant="outline"
          className="h-5 border-destructive/30 bg-destructive/10 py-0 text-[10px] font-semibold text-destructive"
        >
          ENDED
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="h-5 py-0 text-[10px] font-semibold text-muted-foreground"
        >
          NOT STARTED
        </Badge>
      );
  }
}
