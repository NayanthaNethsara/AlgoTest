import "server-only";
import { cache } from "react";
import { backendFetch } from "@/lib/api/server";
import type { ProctorSelfStatus } from "@/types/proctor";

/**
 * Reads this contestant's proctoring status, and records that they have a portal
 * open as a side effect of the same request. Shared by the client's status poll and
 * by the server render that seeds it.
 */
export async function fetchProctorGate(
  tabVisible = true,
): Promise<ProctorSelfStatus | null> {
  try {
    const res = await backendFetch(
      `/api/v1/telemetry/self?tab_visible=${tabVisible}`,
      {
        method: "GET",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProctorSelfStatus;
  } catch {
    return null;
  }
}

/**
 * The server render's read, memoized for the length of one request.
 *
 * The portal layout and the page it wraps both need the verdict — the layout to
 * decide what to paint, the page to decide whether to fetch a problem statement at
 * all — and they render in the same pass. Without the memo that is two round trips
 * per navigation to answer one question.
 */
export const readProctorGate = cache(() => fetchProctorGate(true));
