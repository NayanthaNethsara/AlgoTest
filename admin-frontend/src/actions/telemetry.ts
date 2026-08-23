"use server";

import { backendFetch } from "@/lib/api/server";
import type { EvidenceFinding, ProctorTimeline } from "@/types/proctor";
import {
  MONITORING_SECTIONS,
  type MonitoringSection,
  type MonitoringSnapshot,
} from "@/types/monitoring";

export async function getMonitoringSnapshotAction(sections: MonitoringSection[]): Promise<{
  snapshot?: MonitoringSnapshot;
  /** Distinct from `error`: the page redirects rather than showing a banner. */
  unauthenticated?: boolean;
  error?: string;
}> {
  const include = MONITORING_SECTIONS.filter((section) => sections.includes(section));
  const query = include.length > 0 ? `?include=${include.join(",")}` : "";

  try {
    const response = await backendFetch(`/api/v1/admin/monitoring${query}`, {
      method: "GET",
    });

    if (response.status === 401 || response.status === 403) {
      return { unauthenticated: true };
    }
    if (!response.ok) {
      return { error: "Monitoring overview unavailable" };
    }
    const data = (await response.json()) as MonitoringSnapshot;
    return { snapshot: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Monitoring service unreachable";
    return { error: message };
  }
}

export async function setProctorAccessAction(
  userId: string,
  grant: { webWithAgent: boolean; webOnly: boolean },
  reason = "",
  hoursValid = 0
): Promise<{ status?: string; warning?: string; error?: string }> {
  try {
    const response = await backendFetch(`/api/v1/admin/users/${userId}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webWithAgent: grant.webWithAgent,
        webOnly: grant.webOnly,
        reason,
        hoursValid,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: err.error || "Failed to update proctor access" };
    }
    const data = await response.json().catch(() => ({}));
    return { status: "updated", warning: data.warning };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message };
  }
}

export async function revokeAgentAction(
  agentId: string,
  reason: string
): Promise<{ status?: string; error?: string }> {
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

export const revokeProctorEnrolmentAction = revokeAgentAction;

export async function getAdminProctorFindingsAction(userId: string): Promise<{
  findings: EvidenceFinding[];
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
  reason?: string
): Promise<{ status?: string; error?: string }> {
  try {
    const response = await backendFetch(`/api/v1/admin/proctor/exempt/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exempt, reason }),
    });
    if (!response.ok) {
      return { error: "Failed to update exemption status" };
    }
    return { status: "updated" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message };
  }
}

export async function getAdminProctorTimelineAction(userId: string): Promise<{
  timeline?: ProctorTimeline;
  error?: string;
}> {
  try {
    const response = await backendFetch(`/api/v1/admin/proctor/timeline/${userId}`, {
      method: "GET",
    });
    if (!response.ok) {
      return { error: "Failed to load contestant evidence timeline" };
    }
    const data = (await response.json()) as { timeline: ProctorTimeline };
    return { timeline: data.timeline };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Telemetry service unreachable";
    return { error: message };
  }
}
