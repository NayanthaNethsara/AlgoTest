"use server";

import { backendFetch } from "@/lib/api/server";
import {
  proctorAccessSchema,
  revokeAgentSchema,
  toggleProctorExemptionSchema,
  proctorUserQuerySchema,
} from "@/lib/validation/monitoring";
import type { EvidenceFinding, ProctorTimeline } from "@/types/proctor";
import {
  MONITORING_SECTIONS,
  type MonitoringSection,
  type MonitoringSnapshot,
} from "@/types/monitoring";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function getMonitoringSnapshotAction(sections: MonitoringSection[]): Promise<{
  snapshot?: MonitoringSnapshot;
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
  } catch (err: unknown) {
    return { error: getErrorMessage(err, "Monitoring service unreachable") };
  }
}

export async function setProctorAccessAction(
  userId: string,
  grant: { webOnly: boolean },
  reason = "",
  hoursValid = 0
): Promise<{ status?: string; warning?: string; error?: string }> {
  const parsed = proctorAccessSchema.safeParse({
    userId,
    webOnly: grant.webOnly,
    reason,
    hoursValid,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid proctor access parameters" };
  }

  try {
    const response = await backendFetch(`/api/v1/admin/users/${encodeURIComponent(parsed.data.userId)}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webOnly: parsed.data.webOnly,
        reason: parsed.data.reason,
        hoursValid: parsed.data.hoursValid,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: err.error || "Failed to update proctor access" };
    }
    const data = await response.json().catch(() => ({}));
    return { status: "updated", warning: data.warning };
  } catch (err: unknown) {
    return { error: getErrorMessage(err, "Network error") };
  }
}

export async function revokeAgentAction(
  agentId: string,
  reason: string
): Promise<{ status?: string; error?: string }> {
  const parsed = revokeAgentSchema.safeParse({ agentId, reason });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid revocation parameters" };
  }

  try {
    const response = await backendFetch(`/api/v1/admin/proctor/agents/${encodeURIComponent(parsed.data.agentId)}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: parsed.data.reason }),
    });
    if (!response.ok) {
      return { error: "Failed to revoke agent enrolment" };
    }
    return { status: "revoked" };
  } catch (err: unknown) {
    return { error: getErrorMessage(err, "Network error") };
  }
}

export const revokeProctorEnrolmentAction = revokeAgentAction;

export async function readmitContestantAction(
  userId: string
): Promise<{ status?: string; error?: string }> {
  const parsed = proctorUserQuerySchema.safeParse({ userId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid user ID" };
  }

  try {
    const response = await backendFetch(
      `/api/v1/admin/proctor/users/${encodeURIComponent(parsed.data.userId)}/readmit`,
      {
        method: "POST",
      }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: err.error || "Failed to re-admit contestant" };
    }
    return { status: "readmitted" };
  } catch (err: unknown) {
    return { error: getErrorMessage(err, "Network error") };
  }
}

export async function getAdminProctorFindingsAction(userId: string): Promise<{
  findings: EvidenceFinding[];
  error?: string;
}> {
  const parsed = proctorUserQuerySchema.safeParse({ userId });
  if (!parsed.success) {
    return { findings: [], error: parsed.error.issues[0]?.message || "Invalid user ID" };
  }

  try {
    const response = await backendFetch(`/api/v1/admin/proctor/findings/${encodeURIComponent(parsed.data.userId)}`, {
      method: "GET",
    });
    if (!response.ok) {
      return { findings: [], error: "Failed to fetch findings" };
    }
    const data = await response.json();
    return { findings: data.findings || [] };
  } catch (err: unknown) {
    return { findings: [], error: getErrorMessage(err, "Network error") };
  }
}

export async function toggleProctorExemptionAction(
  userId: string,
  exempt: boolean,
  reason?: string
): Promise<{ status?: string; error?: string }> {
  const parsed = toggleProctorExemptionSchema.safeParse({ userId, exempt, reason });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid exemption parameters" };
  }

  try {
    const response = await backendFetch(`/api/v1/admin/users/${encodeURIComponent(parsed.data.userId)}/exemption`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exempt: parsed.data.exempt,
        reason: parsed.data.reason || (parsed.data.exempt ? "Granted by administrator" : ""),
      }),
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return { error: errBody.error || "Failed to update exemption status" };
    }
    return { status: "updated" };
  } catch (err: unknown) {
    return { error: getErrorMessage(err, "Network error") };
  }
}

export async function getAdminProctorTimelineAction(userId: string): Promise<{
  timeline?: ProctorTimeline;
  error?: string;
}> {
  const parsed = proctorUserQuerySchema.safeParse({ userId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid user ID" };
  }

  try {
    const response = await backendFetch(`/api/v1/admin/proctor/timeline/${encodeURIComponent(parsed.data.userId)}`, {
      method: "GET",
    });
    if (!response.ok) {
      return { error: "Failed to load contestant evidence timeline" };
    }
    const data = await response.json();
    const timeline: ProctorTimeline | undefined =
      data && typeof data === "object"
        ? (data.timeline ?? (data.userId ? (data as ProctorTimeline) : undefined))
        : undefined;
    return { timeline };
  } catch (err: unknown) {
    return { error: getErrorMessage(err, "Telemetry service unreachable") };
  }
}
