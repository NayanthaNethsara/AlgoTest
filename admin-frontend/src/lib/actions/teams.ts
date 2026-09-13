"use server";

import { backendFetch } from "@/lib/api/server";
import { parseApiError, getErrorMessage } from "@/lib/errors";
import {
  createTeamInputSchema,
  updateTeamInputSchema,
  addTeamMemberPayloadSchema,
  bulkCreateTeamsSchema,
} from "@/lib/validation/team";
import type { Team, CreateTeamInput } from "@/types/team";
import type { User } from "@/types/user";

export async function listTeamsAction(): Promise<Team[]> {
  try {
    const res = await backendFetch("/api/v1/admin/teams");
    if (!res.ok) {
      throw await parseApiError(res, "Failed to fetch teams");
    }
    const data = await res.json();
    return data.teams || [];
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to fetch teams"));
  }
}

export async function createTeamAction(
  input: CreateTeamInput
): Promise<{ team: Team; members?: Array<{ user: User; password?: string }> }> {
  const parsed = createTeamInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid team input data");
  }

  try {
    const res = await backendFetch("/api/v1/admin/teams", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to create team");
    }
    return await res.json();
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to create team"));
  }
}

export type BulkTeamResult = {
  created: Array<{ team: Team; members?: Array<{ user: User; password?: string }> }>;
  errors: Array<{ name: string; error: string }>;
};

export async function bulkCreateTeamsAction(
  teamInputs: CreateTeamInput[]
): Promise<BulkTeamResult> {
  const created: BulkTeamResult["created"] = [];
  const errors: BulkTeamResult["errors"] = [];

  if (teamInputs.length === 0) {
    return { created, errors };
  }

  const parsed = bulkCreateTeamsSchema.safeParse({ teams: teamInputs });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid bulk team input data");
  }

  try {
    const res = await backendFetch("/api/v1/admin/teams/bulk", {
      method: "POST",
      body: JSON.stringify({ teams: parsed.data.teams }),
    });

    if (!res.ok) {
      throw await parseApiError(res, "Failed to bulk create teams");
    }

    const data = await res.json();
    const results: Array<{
      name: string;
      status: "created" | "error";
      team?: Team;
      members?: Array<{ user: User; password?: string }>;
      error?: string;
    }> = data.results || [];

    for (const item of results) {
      if (item.status === "created" && item.team) {
        created.push({ team: item.team, members: item.members });
      } else {
        errors.push({
          name: item.name,
          error: item.error || "Failed to create team",
        });
      }
    }

    return { created, errors };
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to bulk create teams"));
  }
}

export async function updateTeamAction(id: string, name: string): Promise<Team> {
  const parsed = updateTeamInputSchema.safeParse({ name });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid team name");
  }

  try {
    const res = await backendFetch(`/api/v1/admin/teams/${id}`, {
      method: "PUT",
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to update team");
    }
    const data = await res.json();
    return data.team;
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to update team"));
  }
}

export async function deleteTeamAction(id: string): Promise<void> {
  try {
    const res = await backendFetch(`/api/v1/admin/teams/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to delete team");
    }
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to delete team"));
  }
}

export type AddTeamMemberPayload =
  { userId: string } | { username: string; displayName?: string; password?: string };

export async function addTeamMemberAction(
  teamId: string,
  payload: AddTeamMemberPayload
): Promise<{ team: Team; user?: User; password?: string }> {
  const parsed = addTeamMemberPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || "Invalid team member data");
  }

  try {
    const res = await backendFetch(`/api/v1/admin/teams/${teamId}/members`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to add team member");
    }
    return await res.json();
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to add team member"));
  }
}

export async function removeTeamMemberAction(teamId: string, userId: string): Promise<Team> {
  try {
    const res = await backendFetch(`/api/v1/admin/teams/${teamId}/members/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw await parseApiError(res, "Failed to remove team member");
    }
    const data = await res.json();
    return data.team;
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to remove team member"));
  }
}
