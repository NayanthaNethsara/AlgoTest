"use server";

import { backendFetch } from "@/lib/api/server";
import type { ProctorTimeline } from "@/types/proctor";
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
    const response = await backendFetch(`/api/v1/admin/monitoring${query}`, { method: "GET" });

    if (response.status === 401 || response.status === 403) {
      return { unauthenticated: true };
    }
    if (!response.ok) {
      return { error: "Monitoring feed unavailable." };
    }

    return { snapshot: await response.json() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Monitoring feed unavailable." };
  }
}

export async function getAdminProctorTimelineAction(userId: string): Promise<{
  timeline: ProctorTimeline | null;
  error?: string;
}> {
  try {
    const response = await backendFetch(`/api/v1/admin/proctor/timeline/${userId}`, {
      method: "GET",
    });
    if (!response.ok) {
      return { timeline: null, error: "Failed to fetch contestant timeline" };
    }
    return { timeline: await response.json() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { timeline: null, error: message };
  }
}

export async function revokeAgentAction(
  agentId: string,
  reason: string
): Promise<{
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

export async function setProctorAccessAction(
  userId: string,
  grant: { webWithAgent: boolean; webOnly: boolean },
  reason: string,
  hoursValid = 0
): Promise<{
  status?: string;
  /** Set when the saved combination works against the organizer who set it. */
  warning?: string;
  error?: string;
}> {
  try {
    const response = await backendFetch(`/api/v1/admin/users/${userId}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...grant, reason, hoursValid }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: body.error ?? "Failed to update submission access" };
    }
    return { status: "updated", warning: body.warning || undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message };
  }
}

export async function toggleProctorExemptionAction(
  userId: string,
  exempt: boolean,
  reason: string,
  hoursValid = 4
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
