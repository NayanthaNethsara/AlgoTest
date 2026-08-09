"use server";

import { backendFetch } from "@/lib/api/server";
import type { ProctorSelfStatus } from "@/types/proctor";

export type WebTelemetryPayload = {
  tab_visible: boolean;
  os_info: string;
};

/// Records that this contestant is on the browser fallback. It carries no signals
/// and never affects agent liveness — the agent is the only source of truth for
/// that, which is what keeps the browser a fallback rather than a way around
/// proctoring.
export async function pingWebTelemetryAction(payload: WebTelemetryPayload): Promise<boolean> {
  try {
    const res = await backendFetch("/api/v1/telemetry/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getProctorSelfAction(): Promise<ProctorSelfStatus | null> {
  try {
    const res = await backendFetch("/api/v1/telemetry/self", { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as ProctorSelfStatus;
  } catch {
    return null;
  }
}
