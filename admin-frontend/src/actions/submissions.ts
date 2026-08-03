"use server";

import { backendFetch } from "@/lib/api/server";
import type { AdminSubmission } from "@/types/submission";

export type { AdminSubmission };

export async function listAdminSubmissionsAction(
  statusFilter = "",
  problemId = "",
  teamId = "",
): Promise<{ submissions: AdminSubmission[]; total: number }> {
  try {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (problemId) params.set("problem_id", problemId);
    if (teamId) params.set("team_id", teamId);

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await backendFetch(`/api/v1/admin/submissions${query}`, {
      method: "GET",
    });

    if (res.ok) {
      return res.json();
    }
  } catch {
    // Ignore error and return empty fallback
  }

  return { submissions: [], total: 0 };
}

export async function rejudgeSubmissionAction(
  submissionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await backendFetch(`/api/v1/admin/submissions/${submissionId}/rejudge`, {
      method: "POST",
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Failed to re-judge submission" };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

export async function cancelSubmissionAction(
  submissionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await backendFetch(`/api/v1/admin/submissions/${submissionId}/cancel`, {
      method: "POST",
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Failed to cancel submission" };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

export async function unstickTeamAction(
  teamId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await backendFetch(`/api/v1/admin/teams/${teamId}/unstick`, {
      method: "POST",
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Failed to clear team submission locks" };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}
