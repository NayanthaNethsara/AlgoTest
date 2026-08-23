"use client";

import { useState } from "react";
import { Plus, Search, AlertCircle } from "lucide-react";
import {
  createTeamAction,
  updateTeamAction,
  deleteTeamAction,
  addTeamMemberAction,
  removeTeamMemberAction,
} from "@/lib/actions/teams";
import type { Team } from "@/types/team";
import type { User } from "@/types/user";
import { ConfirmDialog } from "./confirm-dialog";
import { CredentialsAlert } from "./credentials-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TeamTable } from "./teams/team-table";
import { TeamCreateDialog } from "./teams/team-create-dialog";
import { TeamEditDialog } from "./teams/team-edit-dialog";
import { TeamAddMemberDialog } from "./teams/team-add-member-dialog";

type Credential = { username: string; password: string };

export function AdminTeams({
  teams,
  competitors,
  onRefresh,
}: {
  teams: Team[];
  competitors: User[];
  onRefresh: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [creds, setCreds] = useState<Credential[]>([]);

  // Dialog states
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editTeamTarget, setEditTeamTarget] = useState<Team | null>(null);
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<Team | null>(null);
  const [addMemberTarget, setAddMemberTarget] = useState<Team | null>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ team: Team; user: User } | null>(
    null
  );

  const unassignedCompetitors = competitors.filter((c) => !c.teamId);

  const filteredTeams = teams.filter((t) => {
    const nameMatch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const memberMatch = t.members?.some(
      (m) =>
        m.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.displayName && m.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    return nameMatch || memberMatch;
  });

  async function handleCreateTeam(name: string) {
    setError(null);
    setPending(true);
    try {
      const res = await createTeamAction({ name });
      if (res.members && res.members.length > 0) {
        const createdCreds = res.members
          .filter((m) => m.password)
          .map((m) => ({ username: m.user.username, password: m.password! }));
        setCreds((prev) => [...createdCreds, ...prev]);
      }
      setShowCreateTeam(false);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleUpdateTeam(teamId: string, newName: string) {
    setError(null);
    setPending(true);
    try {
      await updateTeamAction(teamId, newName);
      setEditTeamTarget(null);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function confirmDeleteTeam() {
    if (!deleteTeamTarget) return;
    const id = deleteTeamTarget.id;
    setDeleteTeamTarget(null);
    setError(null);
    setPending(true);
    try {
      await deleteTeamAction(id);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleAddMember(teamId: string, userId: string) {
    setError(null);
    setPending(true);
    try {
      await addTeamMemberAction(teamId, { userId });
      setAddMemberTarget(null);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function confirmRemoveMember() {
    if (!removeMemberTarget) return;
    const { team, user } = removeMemberTarget;
    setRemoveMemberTarget(null);
    setError(null);
    setPending(true);
    try {
      await removeTeamMemberAction(team.id, user.id);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Teams</h2>
          <p className="text-xs text-muted-foreground">
            {teams.length} team(s) registered in contest
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setShowCreateTeam(!showCreateTeam)}
          className="gap-1.5 text-xs"
        >
          <Plus className="h-4 w-4" /> Create Team
        </Button>
      </div>

      <CredentialsAlert credentials={creds} onClear={() => setCreds([])} />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showCreateTeam && (
        <TeamCreateDialog
          pending={pending}
          onSubmit={handleCreateTeam}
          onCancel={() => setShowCreateTeam(false)}
        />
      )}

      {/* Search Input */}
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by team or member name..."
          className="pl-8 h-8 text-xs"
        />
      </div>

      <TeamTable
        teams={filteredTeams}
        pending={pending}
        onEditTeam={(t) => setEditTeamTarget(t)}
        onDeleteTeam={(t) => setDeleteTeamTarget(t)}
        onAddMember={(t) => setAddMemberTarget(t)}
        onRemoveMember={(t, m) => setRemoveMemberTarget({ team: t, user: m })}
      />

      {editTeamTarget && (
        <TeamEditDialog
          team={editTeamTarget}
          pending={pending}
          onSave={handleUpdateTeam}
          onClose={() => setEditTeamTarget(null)}
        />
      )}

      {addMemberTarget && (
        <TeamAddMemberDialog
          team={addMemberTarget}
          unassignedCompetitors={unassignedCompetitors}
          pending={pending}
          onAdd={handleAddMember}
          onClose={() => setAddMemberTarget(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTeamTarget)}
        onOpenChange={(open) => !open && setDeleteTeamTarget(null)}
        title="Delete Team"
        description={
          <>
            Are you sure you want to permanently delete{" "}
            <strong className="text-foreground">{deleteTeamTarget?.name}</strong>? Assigned members
            will remain in the system as unassigned competitors.
          </>
        }
        actionLabel="Delete Team"
        variant="destructive"
        onConfirm={confirmDeleteTeam}
      />

      <ConfirmDialog
        open={Boolean(removeMemberTarget)}
        onOpenChange={(open) => !open && setRemoveMemberTarget(null)}
        title="Remove Member from Team"
        description={
          <>
            Are you sure you want to remove{" "}
            <strong className="text-foreground">
              {removeMemberTarget?.user.displayName || removeMemberTarget?.user.username}
            </strong>{" "}
            from team <strong className="text-foreground">{removeMemberTarget?.team.name}</strong>?
          </>
        }
        actionLabel="Remove Member"
        variant="destructive"
        onConfirm={confirmRemoveMember}
      />
    </div>
  );
}
