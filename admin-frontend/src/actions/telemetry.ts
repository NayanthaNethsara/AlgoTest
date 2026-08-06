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

export async function getAdminProctorRiskAction(): Promise<{
  risk: any[];
  error?: string;
}> {
  try {
    const response = await backendFetch("/api/v1/admin/proctor/risk", {
      method: "GET",
    });
    if (!response.ok) {
      return { risk: [], error: "Failed to fetch proctor risk" };
    }
    const data = await response.json();
    return { risk: data.risk || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { risk: [], error: message };
  }
}

export async function getAdminProctorFindingsAction(userId: string): Promise<{
  findings: any[];
  error?: string;
}> {
  try {
    const response = await backendFetch(`/api/v1/admin/proctor/findings/${userId}`, {
      method: "GET",
    });
    if (!response.ok) {
      return { findings: [], error: "Failed to fetch findings" };
    }
    const data = await response.json();
    return { findings: data.findings || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { findings: [], error: message };
  }
}

export async function toggleProctorExemptionAction(userId: string, exempt: boolean): Promise<{
  status?: string;
  error?: string;
}> {
  try {
    const response = await backendFetch(`/api/v1/admin/users/${userId}/exemption`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exempt }),
    });
    if (!response.ok) {
      return { error: "Failed to update exemption" };
    }
    return { status: "updated" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message };
  }
}
