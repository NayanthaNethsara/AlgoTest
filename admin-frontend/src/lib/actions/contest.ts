"use server";

import { backendFetch } from "@/lib/api/server";
import {
  startContestSchema,
  extendContestSchema,
  updateContestSettingsSchema,
} from "@/lib/validation/contest";
import {
  CONTEST_STATUS,
  type ContestSettingsInput,
  type ContestState,
} from "@/types/contest";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const defaultContestState: ContestState = {
  title: "MiniAlgothon 2026",
  status: CONTEST_STATUS.NOT_STARTED,
  startTime: null,
  endTime: null,
  durationSeconds: 7200,
  freezeMinutes: 30,
  pausedAt: null,
  remainingSeconds: 7200,
  elapsedSeconds: 0,
  isFrozen: false,
  serverTime: new Date().toISOString(),
};

function normalizeState(data: Record<string, unknown>): ContestState {
  return {
    title: (data.title as string) || defaultContestState.title,
    status: (data.status as ContestState["status"]) || defaultContestState.status,
    startTime: (data.startTime as string) || null,
    endTime: (data.endTime as string) || null,
    durationSeconds: Number(data.durationSeconds) || 7200,
    freezeMinutes: Number(data.freezeMinutes) || 30,
    pausedAt: (data.pausedAt as string) || null,
    remainingSeconds: Number(data.remainingSeconds) || 0,
    elapsedSeconds: Number(data.elapsedSeconds) || 0,
    isFrozen: Boolean(data.isFrozen),
    serverTime: (data.serverTime as string) || new Date().toISOString(),
  };
}

export async function getAdminContestStateAction(): Promise<ContestState> {
  try {
    const res = await backendFetch("/api/v1/admin/contest/state");
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to fetch contest state");
    }
    const data = await res.json();
    return normalizeState(data);
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to fetch contest state"));
  }
}

export async function startContestAction(
  durationMinutes?: number,
): Promise<ContestState> {
  const parsed = startContestSchema.safeParse({ durationMinutes });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid start contest parameters");
  }

  try {
    const res = await backendFetch("/api/v1/admin/contest/start", {
      method: "POST",
      body: JSON.stringify({ durationMinutes: parsed.data.durationMinutes || 0 }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to start contest");
    }
    const data = await res.json();
    return normalizeState(data);
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to start contest"));
  }
}

export async function pauseContestAction(): Promise<ContestState> {
  try {
    const res = await backendFetch("/api/v1/admin/contest/pause", {
      method: "POST",
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to pause contest");
    }
    const data = await res.json();
    return normalizeState(data);
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to pause contest"));
  }
}

export async function resumeContestAction(): Promise<ContestState> {
  try {
    const res = await backendFetch("/api/v1/admin/contest/resume", {
      method: "POST",
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to resume contest");
    }
    const data = await res.json();
    return normalizeState(data);
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to resume contest"));
  }
}

export async function extendContestAction(
  minutes: number,
): Promise<ContestState> {
  const parsed = extendContestSchema.safeParse({ minutes });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid extend contest parameters");
  }

  try {
    const res = await backendFetch("/api/v1/admin/contest/extend", {
      method: "POST",
      body: JSON.stringify({ minutes: parsed.data.minutes }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to extend contest duration");
    }
    const data = await res.json();
    return normalizeState(data);
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to extend contest duration"));
  }
}

export async function resetContestAction(): Promise<ContestState> {
  try {
    const res = await backendFetch("/api/v1/admin/contest/reset", {
      method: "POST",
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to reset contest");
    }
    const data = await res.json();
    return normalizeState(data);
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to reset contest"));
  }
}

export async function endContestAction(): Promise<ContestState> {
  try {
    const res = await backendFetch("/api/v1/admin/contest/end", {
      method: "POST",
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to end contest");
    }
    const data = await res.json();
    return normalizeState(data);
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to end contest"));
  }
}

export async function updateContestSettingsAction(
  settings: ContestSettingsInput,
): Promise<ContestState> {
  const parsed = updateContestSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid contest settings");
  }

  try {
    const res = await backendFetch("/api/v1/admin/contest/settings", {
      method: "PUT",
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to update contest settings");
    }
    const data = await res.json();
    return normalizeState(data);
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to update contest settings"));
  }
}
