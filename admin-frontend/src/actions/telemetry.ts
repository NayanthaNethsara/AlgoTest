"use server";

import { backendFetch } from "@/lib/api/server";
import type { CompetitorHeartbeat } from "@/types/telemetry";
import type { EnrolledAgent, ProctorOverview, ProctorTimeline } from "@/types/proctor";

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

export async function getAdminProctorOverviewAction(): Promise<{
  overview: ProctorOverview | null;
  error?: string;
}> {
  try {
    const response = await backendFetch("/api/v1/admin/proctor/overview", { method: "GET" });
    if (!response.ok) {
      return { overview: null, error: "Failed to fetch proctoring overview" };
    }
    return { overview: await response.json() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { overview: null, error: message };
  }
}

export async function getAdminAgentsAction(): Promise<{
  agents: EnrolledAgent[];
  incidentOpen: boolean;
  error?: string;
}> {
  try {
    const response = await backendFetch("/api/v1/admin/proctor/agents", { method: "GET" });
    if (!response.ok) {
      return { agents: [], incidentOpen: false, error: "Failed to fetch enrolled agents" };
    }
    const data = await response.json();
    return { agents: data.agents || [], incidentOpen: Boolean(data.incidentOpen) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { agents: [], incidentOpen: false, error: message };
  }
}

export async function getAdminProctorTimelineAction(userId: string): Promise<{
  timeline: ProctorTimeline | null;
  error?: string;
}> {
  try {
    const response = await backendFetch(`/api/v1/admin/proctor/timeline/${userId}`, { method: "GET" });
    if (!response.ok) {
      return { timeline: null, error: "Failed to fetch contestant timeline" };
    }
    return { timeline: await response.json() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { timeline: null, error: message };
  }
}

export async function revokeAgentAction(agentId: string, reason: string): Promise<{
  status?: string;
  error?: string;
}> {
  try {
    const response = await backendFetch(`/api/v1/admin/proctor/agents/${agentId}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      return { error: "Failed to revoke agent enrolment" };
    }
    return { status: "revoked" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message };
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

export async function toggleProctorExemptionAction(
  userId: string,
  exempt: boolean,
  reason: string,
  hoursValid = 4,
): Promise<{
  status?: string;
  error?: string;
}> {
  try {
    const response = await backendFetch(`/api/v1/admin/users/${userId}/exemption`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exempt, reason, hoursValid }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { error: body.error ?? "Failed to update exemption" };
    }
    return { status: "updated" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message };
  }
}
