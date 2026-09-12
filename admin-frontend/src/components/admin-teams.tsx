"use client";

import { useState } from "react";
import { AlertTriangleIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
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
import { getErrorMessage } from "@/lib/errors";
import { PageHeader } from "@/components/shell/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Spinner } from "@/components/ui/spinner";
import { TeamTable } from "./teams/team-table";
import { TeamCreateDialog } from "./teams/team-create-dialog";
import { TeamEditDialog } from "./teams/team-edit-dialog";
import { TeamAddMemberDialog } from "./teams/team-add-member-dialog";

type Credential = { username: string; password: string };

export function AdminTeams({
  teams,
  competitors,
  onRefresh,
  refreshing = false,
  loadError = null,
}: {
  teams: Team[];
  competitors: User[];
  onRefresh: () => void;
  refreshing?: boolean;
  loadError?: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
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

  const query = searchQuery.trim().toLowerCase();
  const filteredTeams = query
    ? teams.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.members?.some(
            (m) =>
              m.username.toLowerCase().includes(query) ||
              m.displayName?.toLowerCase().includes(query)
          )
      )
    : teams;

  async function handleCreateTeam(name: string) {
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
      toast.success("Team created", { description: name });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create the team."));
    } finally {
      setPending(false);
    }
  }

  async function handleUpdateTeam(teamId: string, newName: string) {
    setPending(true);
    try {
      await updateTeamAction(teamId, newName);
      setEditTeamTarget(null);
      toast.success("Team renamed", { description: newName });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to rename the team."));
    } finally {
      setPending(false);
    }
  }

  async function confirmDeleteTeam() {
    if (!deleteTeamTarget) return;
    const target = deleteTeamTarget;
    setDeleteTeamTarget(null);
    setPending(true);
    try {
      await deleteTeamAction(target.id);
      toast.success("Team deleted", { description: target.name });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete the team."));
    } finally {
      setPending(false);
    }
  }

  async function handleAddMember(teamId: string, userId: string) {
    setPending(true);
    try {
      await addTeamMemberAction(teamId, { userId });
      setAddMemberTarget(null);
      toast.success("Member added to team");
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add the member."));
    } finally {
      setPending(false);
    }
  }

  async function confirmRemoveMember() {
    if (!removeMemberTarget) return;
    const { team, user } = removeMemberTarget;
    setRemoveMemberTarget(null);
    setPending(true);
    try {
      await removeTeamMemberAction(team.id, user.id);
      toast.success("Member removed", { description: `${user.username} · ${team.name}` });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove the member."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Teams"
        description={`${teams.length} team(s) registered · ${unassignedCompetitors.length} competitor(s) unassigned`}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              {refreshing ? <Spinner /> : <RefreshCwIcon />} Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreateTeam(true)} className="gap-1.5">
              <PlusIcon /> Create team
            </Button>
          </>
        }
      />

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Showing the last loaded data</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <CredentialsAlert credentials={creds} onClear={() => setCreds([])} />

      {showCreateTeam && (
        <TeamCreateDialog
          pending={pending}
          onSubmit={handleCreateTeam}
          onCancel={() => setShowCreateTeam(false)}
        />
      )}

      <SearchInput
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder="Search by team or member name…"
        className="sm:max-w-xs"
      />

      <TeamTable
        teams={filteredTeams}
        pending={pending}
        searching={query.length > 0}
        onClearSearch={() => setSearchQuery("")}
        onCreateTeam={() => setShowCreateTeam(true)}
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
