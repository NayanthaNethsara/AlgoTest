"use server";

import { backendFetch } from "@/lib/api/server";
import {
  reviewSubmissionSchema,
  rejudgeSubmissionSchema,
  rejudgeProblemSchema,
  cancelSubmissionSchema,
} from "@/lib/validation/submission";
import type { AdminSubmission, ReviewStatus } from "@/types/submission";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function listAdminSubmissionsAction(
  statusFilter = "",
  problemId = "",
  teamId = ""
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
  submissionId: string
): Promise<{ success: boolean; error?: string }> {
  const parsed = rejudgeSubmissionSchema.safeParse({ submissionId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid submission ID" };
  }

  try {
    const res = await backendFetch(`/api/v1/admin/submissions/${encodeURIComponent(parsed.data.submissionId)}/rejudge`, {
      method: "POST",
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Failed to re-judge submission" };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, "Network error") };
  }
}

export async function rejudgeProblemSubmissionsAction(
  problemId: string
): Promise<{ success: boolean; requeued?: number; error?: string }> {
  const parsed = rejudgeProblemSchema.safeParse({ problemId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid problem ID" };
  }

  try {
    const res = await backendFetch(`/api/v1/admin/problems/${encodeURIComponent(parsed.data.problemId)}/rejudge`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, requeued: data.requeued };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Failed to re-judge problem submissions" };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, "Network error") };
  }
}

export async function cancelSubmissionAction(
  submissionId: string
): Promise<{ success: boolean; error?: string }> {
  const parsed = cancelSubmissionSchema.safeParse({ submissionId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid submission ID" };
  }

  try {
    const res = await backendFetch(`/api/v1/admin/submissions/${encodeURIComponent(parsed.data.submissionId)}/cancel`, {
      method: "POST",
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Failed to cancel submission" };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, "Network error") };
  }
}

export async function reviewSubmissionAction(
  submissionId: string,
  status: ReviewStatus,
  reason?: string
): Promise<{ success: boolean; submission?: AdminSubmission; error?: string }> {
  const parsed = reviewSubmissionSchema.safeParse({ status, reason });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid review parameters" };
  }

  try {
    const res = await backendFetch(`/api/v1/admin/submissions/${encodeURIComponent(submissionId)}/review`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, submission: data.submission };
    }

    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Failed to review submission" };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, "Network error") };
  }
}

export async function unstickTeamAction(
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await backendFetch(`/api/v1/admin/teams/${encodeURIComponent(teamId)}/unstick`, {
      method: "POST",
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || "Failed to clear team submission locks" };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, "Network error") };
  }
}
