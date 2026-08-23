"use server";

import { backendFetch } from "@/lib/api/server";
import type { LeaderboardEntry } from "@/types/leaderboard";

export async function getLeaderboardAction(): Promise<LeaderboardEntry[]> {
  try {
    const res = await backendFetch("/api/v1/leaderboard");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.leaderboard)) {
        return data.leaderboard;
      }
    }
  } catch (err: unknown) {
    console.error("Failed to fetch leaderboard:", err);
  }
  return [];
}
