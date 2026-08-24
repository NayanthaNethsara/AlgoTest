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
import { CONTEST_STATUS, type ContestState } from "@/types/contest";

type ContestContextValue = {
  state: ContestState;
  remainingSeconds: number;
  elapsedSeconds: number;
  startsInSeconds: number;
  isWarning: boolean;
  isCritical: boolean;
  isFrozen: boolean;
  formattedRemaining: string;
  formattedStartsIn: string;
  refresh: () => Promise<void>;
};

const ContestContext = createContext<ContestContextValue | null>(null);

const WARNING_THRESHOLD_SECONDS = 15 * 60; // 15 minutes
const CRITICAL_THRESHOLD_SECONDS = 5 * 60; // 5 minutes
const BACKGROUND_SYNC_INTERVAL_MS = 20_000; // 20 seconds

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

  const stateRef = useRef(state);
  stateRef.current = state;

  const clockOffsetRef = useRef(clockOffset);
  clockOffsetRef.current = clockOffset;

  const refresh = useCallback(async () => {
    try {
      const next = await getContestStateAction();
      setState(next);
      if (next.serverTime) {
        const offset = new Date(next.serverTime).getTime() - Date.now();
        setClockOffset(offset);
      }
    } catch (err: unknown) {
      console.error("Failed to sync contest state:", err);
    }
  }, []);

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

            if (current.freezeMinutes > 0) {
              const freezeThresholdSec = current.freezeMinutes * 60;
              setIsFrozen(remaining > 0 && remaining <= freezeThresholdSec);
            } else {
              setIsFrozen(false);
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
        formattedRemaining,
        formattedStartsIn,
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
