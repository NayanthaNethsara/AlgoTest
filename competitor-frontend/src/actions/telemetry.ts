"use server";

import { backendFetch } from "@/lib/api/server";

export type WebTelemetryPayload = {
  active_window: string;
  running_processes: string[];
  os_info: string;
  client_type: "WEB";
};

export async function pingWebTelemetryAction(payload: WebTelemetryPayload): Promise<boolean> {
  try {
    const res = await backendFetch("/api/v1/telemetry/ping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
