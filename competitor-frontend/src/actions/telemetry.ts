"use server";

import { backendFetch } from "@/lib/api/server";
import type { ProctorSelfStatus } from "@/types/proctor";

/**
 * Reads this contestant's proctoring status, and records that they have a portal
 * open as a side effect of the same request.
 *
 * Presence used to be a second round-trip. It never carried anything the poll did
 * not already prove, and its own payload was collected client-side and discarded
 * server-side — so it cost every contestant an extra request every tick to record
 * nothing. Browser presence still never affects agent liveness: the agent is the
 * only source of truth for that, which is what keeps the browser a fallback rather
 * than a way around proctoring.
 */
export async function getProctorSelfAction(tabVisible = true): Promise<ProctorSelfStatus | null> {
  try {
    const res = await backendFetch(`/api/v1/telemetry/self?tab_visible=${tabVisible}`, {
      method: "GET",
    });
    if (!res.ok) return null;
    return (await res.json()) as ProctorSelfStatus;
  } catch {
    return null;
  }
}
