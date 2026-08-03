"use server";

import { backendFetch } from "@/lib/api/server";
import type { Team, CreateTeamInput } from "@/types/team";
import type { User } from "@/types/user";

export async function listTeamsAction(): Promise<Team[]> {
  const res = await backendFetch("/api/v1/admin/teams");
  if (!res.ok) throw new Error("Failed to fetch teams");
  const data = await res.json();
  return data.teams || [];
}

export async function createTeamAction(input: CreateTeamInput): Promise<{ team: Team; members?: Array<{ user: User; password?: string }> }> {
  const res = await backendFetch("/api/v1/admin/teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to create team");
  }
  return res.json();
}

export async function updateTeamAction(id: string, name: string): Promise<Team> {
  const res = await backendFetch(`/api/v1/admin/teams/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to update team");
  }
  const data = await res.json();
  return data.team;
}

export async function deleteTeamAction(id: string): Promise<void> {
  const res = await backendFetch(`/api/v1/admin/teams/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to delete team");
  }
}

export type AddTeamMemberPayload =
  | { userId: string }
  | { username: string; displayName?: string; password?: string };

export async function addTeamMemberAction(
  teamId: string,
  payload: AddTeamMemberPayload
): Promise<{ team: Team; user?: User; password?: string }> {
  const res = await backendFetch(`/api/v1/admin/teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to add team member");
  }
  return res.json();
}

export async function removeTeamMemberAction(teamId: string, userId: string): Promise<Team> {
  const res = await backendFetch(`/api/v1/admin/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || "Failed to remove team member");
  }
  const data = await res.json();
  return data.team;
}
