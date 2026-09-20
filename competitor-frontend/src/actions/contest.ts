"use server";

import { backendFetch } from "@/lib/api/server";
import { contestStateSchema } from "@/lib/validation/contest";
import { CONTEST_STATUS, type ContestState } from "@/types/contest";

const defaultContestState: ContestState = {
  title: "Algothon 2026",
  status: CONTEST_STATUS.NOT_STARTED,
  startTime: null,
  endTime: null,
  durationSeconds: 7200,
  freezeMinutes: 30,
  pausedAt: null,
  remainingSeconds: 7200,
  elapsedSeconds: 0,
  isFrozen: false,
  downloadEnabled: false,
  serverTime: new Date().toISOString(),
};

export async function getContestStateAction(): Promise<ContestState> {
  try {
    const res = await backendFetch("/api/v1/contest/state");
    if (!res.ok) {
      return defaultContestState;
    }
    const data = await res.json();
    const parsed = contestStateSchema.safeParse(data);
    if (parsed.success) {
      return parsed.data;
    }
    console.error("Contest state validation failed:", parsed.error);
    return defaultContestState;
  } catch (err: unknown) {
    console.error("Failed to fetch contest state:", err);
    return defaultContestState;
  }
}
