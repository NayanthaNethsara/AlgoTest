"use server";

import { backendFetch } from "@/lib/api/server";
import type { CompetitorHeartbeat } from "@/types/telemetry";

export async function getAdminTelemetryAction(): Promise<{
  telemetry: CompetitorHeartbeat[];
  error?: string;
}> {
  try {
    const response = await backendFetch("/api/v1/admin/telemetry", {
      method: "GET",
    });

    if (!response.ok) {
      return { telemetry: [], error: "Failed to fetch telemetry data" };
    }

    const data = await response.json();
    return { telemetry: data.telemetry || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { telemetry: [], error: message };
  }
}
