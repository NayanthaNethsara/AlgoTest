"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getContestStateAction } from "@/actions/contest";
import {
  CONTEST_STATUS,
  CONTEST_THRESHOLDS_SECONDS,
  type ContestAlert,
  type ContestState,
  type ContestStatus,
} from "@/types/contest";

type ContestContextValue = {
  state: ContestState;
  remainingSeconds: number;
  elapsedSeconds: number;
  startsInSeconds: number;
  isWarning: boolean;
  isCritical: boolean;
  isFrozen: boolean;
  isNotStarted: boolean;
  isRunning: boolean;
  isPaused: boolean;
  isEnded: boolean;
  formattedRemaining: string;
  formattedStartsIn: string;
  alertToast: ContestAlert | null;
  clearAlertToast: () => void;
  refresh: () => Promise<void>;
};

const ContestContext = createContext<ContestContextValue | null>(null);

const WARNING_THRESHOLD_SECONDS = 15 * 60;
const CRITICAL_THRESHOLD_SECONDS = 5 * 60;
const BACKGROUND_SYNC_INTERVAL_MS = 20_000;

function pad(num: number): string {
  return num.toString().padStart(2, "0");
}

export function formatTime(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function ContestProvider({
  initialState,
  children,
}: {
  initialState: ContestState;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ContestState>(initialState);
  const [clockOffset, setClockOffset] = useState<number>(() => {
    if (!initialState.serverTime) return 0;
    return new Date(initialState.serverTime).getTime() - Date.now();
  });

  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    initialState.remainingSeconds,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(
    initialState.elapsedSeconds,
  );
  const [startsInSeconds, setStartsInSeconds] = useState<number>(0);
  const [isFrozen, setIsFrozen] = useState<boolean>(initialState.isFrozen);
  const [alertToast, setAlertToast] = useState<ContestAlert | null>(null);

  const clearAlertToast = useCallback(() => {
    setAlertToast(null);
  }, []);

  const stateRef = useRef(state);
  const clockOffsetRef = useRef(clockOffset);
  const previousStatusRef = useRef<ContestStatus>(initialState.status);
  const previousFrozenRef = useRef<boolean>(initialState.isFrozen);
  const firedThresholdsRef = useRef<Set<number>>(new Set());

  const checkStatusTransitions = useCallback(
    (prevStatus: ContestStatus, currentStatus: ContestStatus) => {
      if (prevStatus === currentStatus) return;

      if (
        prevStatus === CONTEST_STATUS.NOT_STARTED &&
        currentStatus === CONTEST_STATUS.RUNNING
      ) {
        setAlertToast({
          id: `contest-started-${Date.now()}`,
          title: "Contest Started!",
          description:
            "The round is now live. Problem statements and submissions are unlocked.",
          variant: "success",
        });
      } else if (currentStatus === CONTEST_STATUS.PAUSED) {
        setAlertToast({
          id: `contest-paused-${Date.now()}`,
          title: "Contest Paused",
          description:
            "Judges have paused the contest clock. Code execution is on hold.",
          variant: "warning",
        });
      } else if (
        prevStatus === CONTEST_STATUS.PAUSED &&
        currentStatus === CONTEST_STATUS.RUNNING
      ) {
        setAlertToast({
          id: `contest-resumed-${Date.now()}`,
          title: "Contest Resumed",
          description:
            "The competition round is active again. You may continue working.",
          variant: "info",
        });
      } else if (currentStatus === CONTEST_STATUS.ENDED) {
        setAlertToast({
          id: `contest-ended-${Date.now()}`,
          title: "Contest Concluded",
          description:
            "The round has ended. Submissions are closed and workspace is in practice mode.",
          variant: "info",
        });
      }
      previousStatusRef.current = currentStatus;
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await getContestStateAction();
      const prevStatus = stateRef.current.status;
      stateRef.current = next;
      setState(next);

      if (next.serverTime) {
        const offset = new Date(next.serverTime).getTime() - Date.now();
        clockOffsetRef.current = offset;
        setClockOffset(offset);
      }

      checkStatusTransitions(prevStatus, next.status);
    } catch (err: unknown) {
      console.error("Failed to sync contest state:", err);
    }
  }, [checkStatusTransitions]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    clockOffsetRef.current = clockOffset;
  }, [clockOffset]);

  useEffect(() => {
    const tickSync = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const interval = setInterval(tickSync, BACKGROUND_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", tickSync);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tickSync);
    };
  }, [refresh]);

  useEffect(() => {
    const calculateTick = () => {
      const current = stateRef.current;
      const offset = clockOffsetRef.current;
      const now = Date.now() + offset;

      switch (current.status) {
        case CONTEST_STATUS.NOT_STARTED: {
          setRemainingSeconds(current.durationSeconds);
          setElapsedSeconds(0);
          setIsFrozen(false);

          if (current.startTime) {
            const startMs = new Date(current.startTime).getTime();
            const startsIn = Math.max(0, Math.floor((startMs - now) / 1000));
            setStartsInSeconds(startsIn);
          } else {
            setStartsInSeconds(0);
          }
          break;
        }

        case CONTEST_STATUS.RUNNING: {
          setStartsInSeconds(0);
          if (current.endTime) {
            const endMs = new Date(current.endTime).getTime();
            const remaining = Math.max(0, Math.floor((endMs - now) / 1000));
            setRemainingSeconds(remaining);

            if (current.startTime) {
              const startMs = new Date(current.startTime).getTime();
              const elapsed = Math.max(0, Math.floor((now - startMs) / 1000));
              setElapsedSeconds(elapsed);
            }

            const nextFrozen = current.isFrozen;
            setIsFrozen(nextFrozen);

            if (!previousFrozenRef.current && nextFrozen) {
              setAlertToast({
                id: `contest-frozen-${Date.now()}`,
                title: "Scoreboard Frozen",
                description:
                  "Public standings are now frozen. Your submissions will continue to be evaluated.",
                variant: "info",
              });
            }
            previousFrozenRef.current = nextFrozen;

            if (remaining > 0) {
              for (const threshold of CONTEST_THRESHOLDS_SECONDS) {
                if (
                  remaining <= threshold.seconds &&
                  !firedThresholdsRef.current.has(threshold.seconds)
                ) {
                  firedThresholdsRef.current.add(threshold.seconds);
                  setAlertToast({
                    id: `contest-threshold-${threshold.seconds}`,
                    title: `${threshold.label} Remaining`,
                    description:
                      threshold.seconds <= 5 * 60
                        ? `Only ${threshold.label} left in the round! Ensure your final code is submitted.`
                        : `${threshold.label} remaining before submissions close.`,
                    variant: threshold.variant,
                  });
                }
              }
            }
          } else {
            setRemainingSeconds(current.durationSeconds);
            setElapsedSeconds(0);
            setIsFrozen(false);
          }
          break;
        }

        case CONTEST_STATUS.PAUSED: {
          setStartsInSeconds(0);
          setRemainingSeconds(current.remainingSeconds);
          setElapsedSeconds(current.elapsedSeconds);
          setIsFrozen(current.isFrozen);
          break;
        }

        case CONTEST_STATUS.ENDED: {
          setStartsInSeconds(0);
          setRemainingSeconds(0);
          setElapsedSeconds(current.durationSeconds);
          setIsFrozen(false);
          break;
        }
      }
    };

    calculateTick();
    const interval = setInterval(calculateTick, 1000);
    return () => clearInterval(interval);
  }, []);

  const isWarning =
    state.status === CONTEST_STATUS.RUNNING &&
    remainingSeconds > 0 &&
    remainingSeconds <= WARNING_THRESHOLD_SECONDS &&
    remainingSeconds > CRITICAL_THRESHOLD_SECONDS;

  const isCritical =
    state.status === CONTEST_STATUS.RUNNING &&
    remainingSeconds > 0 &&
    remainingSeconds <= CRITICAL_THRESHOLD_SECONDS;

  const isNotStarted = state.status === CONTEST_STATUS.NOT_STARTED;
  const isRunning = state.status === CONTEST_STATUS.RUNNING;
  const isPaused = state.status === CONTEST_STATUS.PAUSED;
  const isEnded = state.status === CONTEST_STATUS.ENDED;

  const formattedRemaining = formatTime(remainingSeconds);
  const formattedStartsIn = formatTime(startsInSeconds);

  return (
    <ContestContext.Provider
      value={{
        state,
        remainingSeconds,
        elapsedSeconds,
        startsInSeconds,
        isWarning,
        isCritical,
        isFrozen,
        isNotStarted,
        isRunning,
        isPaused,
        isEnded,
        formattedRemaining,
        formattedStartsIn,
        alertToast,
        clearAlertToast,
        refresh,
      }}
    >
      {children}
    </ContestContext.Provider>
  );
}

export function useContest() {
  const context = useContext(ContestContext);
  if (!context) {
    throw new Error("useContest must be used within a ContestProvider");
  }
  return context;
}

export function useOptionalContest() {
  return useContext(ContestContext);
}

