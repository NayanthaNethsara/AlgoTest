"use server";

import { backendFetch } from "@/lib/api/server";
import { fetchProctorGate } from "@/lib/proctor-gate";
import type { ProctorSelfStatus } from "@/types/proctor";

/**
 * Reads this contestant's proctoring status, and records that they have a portal
 * open as a side effect of the same request.
 */
export async function getProctorSelfAction(
  tabVisible = true,
): Promise<ProctorSelfStatus | null> {
  return fetchProctorGate(tabVisible);
}

/**
 * Records browser proctoring infractions (fullscreen exits, window blurs, tab switching, devtools attempts).
 */
export async function recordBrowserViolationAction(
  eventType: string,
  detail?: string,
  signals?: Record<string, any>,
): Promise<boolean> {
  try {
    const res = await backendFetch("/api/v1/telemetry/browser-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: eventType,
        detail,
        signals,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

