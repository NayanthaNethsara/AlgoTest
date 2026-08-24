"use server";

import { backendFetch } from "@/lib/api/server";
import { contestStateSchema } from "@/lib/validation/contest";
import { CONTEST_STATUS, type ContestState } from "@/types/contest";

const defaultContestState: ContestState = {
  title: "MiniAlgothon 2026",
  status: CONTEST_STATUS.NOT_STARTED,
  startTime: null,
  endTime: null,
  durationSeconds: 7200,
  freezeMinutes: 30,
  pausedAt: null,
  remainingSeconds: 7200,
  elapsedSeconds: 0,
  isFrozen: false,
  serverTime: new Date().toISOString(),
};

export async function getContestStateAction(): Promise<ContestState> {
  try {
    const res = await backendFetch("/api/v1/contest/state");
    if (res.ok) {
      const data = await res.json();
      const parsed = contestStateSchema.safeParse(data);
      if (parsed.success) {
        return parsed.data;
      }
      return {
        title: data.title || defaultContestState.title,
        status: data.status || defaultContestState.status,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        durationSeconds: Number(data.durationSeconds) || 7200,
        freezeMinutes: Number(data.freezeMinutes) || 30,
        pausedAt: data.pausedAt || null,
        remainingSeconds: Number(data.remainingSeconds) || 0,
        elapsedSeconds: Number(data.elapsedSeconds) || 0,
        isFrozen: Boolean(data.isFrozen),
        serverTime: data.serverTime || new Date().toISOString(),
      };
    }
  } catch (err: unknown) {
    console.error("Failed to fetch contest state:", err);
  }
  return defaultContestState;
}
