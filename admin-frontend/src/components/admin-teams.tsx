"use client";

import { useState } from "react";
import { Plus, Search, Trash2, Edit2, UserPlus, UserMinus, ShieldAlert, Users } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

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
  const [newTeamName, setNewTeamName] = useState("");

  const [editTeamTarget, setEditTeamTarget] = useState<Team | null>(null);
  const [editTeamName, setEditTeamName] = useState("");

  const [deleteTeamTarget, setDeleteTeamTarget] = useState<Team | null>(null);

  const [addMemberTarget, setAddMemberTarget] = useState<Team | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ team: Team; user: User } | null>(null);

  // Available competitor users who are not assigned to any team
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

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setError(null);
    setPending(true);
    try {
      const res = await createTeamAction({ name: newTeamName.trim() });
      if (res.members && res.members.length > 0) {
        const createdCreds = res.members
          .filter((m) => m.password)
          .map((m) => ({ username: m.user.username, password: m.password! }));
        setCreds((prev) => [...createdCreds, ...prev]);
      }
      setNewTeamName("");
      setShowCreateTeam(false);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleUpdateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!editTeamTarget || !editTeamName.trim()) return;
    setError(null);
    setPending(true);
    try {
      await updateTeamAction(editTeamTarget.id, editTeamName.trim());
      setEditTeamTarget(null);
      setEditTeamName("");
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteTeam() {
    if (!deleteTeamTarget) return;
    setError(null);
    setPending(true);
    try {
      await deleteTeamAction(deleteTeamTarget.id);
      setDeleteTeamTarget(null);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  const [addMemberMode, setAddMemberMode] = useState<"existing" | "new">("existing");
  const [newMemberUsername, setNewMemberUsername] = useState("");
  const [newMemberDisplayName, setNewMemberDisplayName] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addMemberTarget) return;
    setError(null);
    setPending(true);
    try {
      if (addMemberMode === "existing") {
        if (!selectedUserId) return;
        await addTeamMemberAction(addMemberTarget.id, { userId: selectedUserId });
      } else {
        if (!newMemberUsername.trim()) return;
        const res = await addTeamMemberAction(addMemberTarget.id, {
          username: newMemberUsername.trim(),
          displayName: newMemberDisplayName.trim() || undefined,
          password: newMemberPassword.trim() || undefined,
        });
        if (res.password && res.user) {
          setCreds((prev) => [{ username: res.user!.username, password: res.password! }, ...prev]);
        }
      }
      setAddMemberTarget(null);
      setSelectedUserId("");
      setNewMemberUsername("");
      setNewMemberDisplayName("");
      setNewMemberPassword("");
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleRemoveMember() {
    if (!removeMemberTarget) return;
    setError(null);
    setPending(true);
    try {
      await removeTeamMemberAction(removeMemberTarget.team.id, removeMemberTarget.user.id);
      setRemoveMemberTarget(null);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Credentials Alert */}
      {creds.length > 0 && <CredentialsAlert credentials={creds} onClear={() => setCreds([])} />}

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium">
          {error}
        </div>
      )}

      {/* Header and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Teams Overview</h2>
          <p className="text-xs text-muted-foreground">
            Manage competition teams, team members, and user assignments. Max 3 members per team.
          </p>
        </div>

        <Button
          onClick={() => {
            setShowCreateTeam(true);
            setError(null);
          }}
          size="sm"
          className="gap-1.5 text-xs font-semibold"
        >
          <Plus className="h-4 w-4" /> Create Team
        </Button>
      </div>

      {/* Create Team Form Modal / Card */}
      {showCreateTeam && (
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-sm font-semibold">Create New Team</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateTeam(false)}
              className="h-7 text-xs text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
          <form onSubmit={handleCreateTeam} className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium">Team Name</label>
              <Input
                type="text"
                placeholder="e.g. AlgoWarriors"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending} className="h-9 text-xs font-medium">
              {pending ? "Creating..." : "Save Team"}
            </Button>
          </form>
        </div>
      )}

      {/* Edit Team Dialog */}
      {editTeamTarget && (
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-sm font-semibold">Rename Team: {editTeamTarget.name}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditTeamTarget(null)}
              className="h-7 text-xs text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
          <form onSubmit={handleUpdateTeam} className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium">New Team Name</label>
              <Input
                type="text"
                value={editTeamName}
                onChange={(e) => setEditTeamName(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending} className="h-9 text-xs font-medium">
              {pending ? "Updating..." : "Update Name"}
            </Button>
          </form>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberTarget && (
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-sm font-semibold">Add Member to Team: {addMemberTarget.name}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddMemberTarget(null)}
              className="h-7 text-xs text-muted-foreground"
            >
              Cancel
            </Button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex border-b text-xs gap-2">
            <button
              type="button"
              onClick={() => setAddMemberMode("existing")}
              className={`pb-2 px-3 font-medium border-b-2 transition-colors ${
                addMemberMode === "existing"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Assign Existing User
            </button>
            <button
              type="button"
              onClick={() => setAddMemberMode("new")}
              className={`pb-2 px-3 font-medium border-b-2 transition-colors ${
                addMemberMode === "new"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Create New User directly in Team
            </button>
          </div>

          <form onSubmit={handleAddMember} className="space-y-4">
            {addMemberMode === "existing" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Select Unassigned Competitor User</label>
                {unassignedCompetitors.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 font-mono">
                    No unassigned competitor users available. Switch to &quot;Create New User&quot; tab to create one directly.
                  </p>
                ) : (
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    required
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">-- Choose User --</option>
                    {unassignedCompetitors.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username} {u.displayName ? `(${u.displayName})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Username *</label>
                  <Input
                    type="text"
                    placeholder="e.g. competitor01"
                    value={newMemberUsername}
                    onChange={(e) => setNewMemberUsername(e.target.value)}
                    required
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Display Name (Optional)</label>
                  <Input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={newMemberDisplayName}
                    onChange={(e) => setNewMemberDisplayName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Password (Optional)</label>
                  <Input
                    type="password"
                    placeholder="Auto-generated if empty"
                    value={newMemberPassword}
                    onChange={(e) => setNewMemberPassword(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddMemberTarget(null)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending || (addMemberMode === "existing" ? !selectedUserId : !newMemberUsername.trim())}
                className="h-8 text-xs font-medium gap-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {pending ? "Adding..." : addMemberMode === "existing" ? "Add to Team" : "Create & Add to Team"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Team Confirmation */}
      <ConfirmDialog
        open={!!deleteTeamTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTeamTarget(null);
        }}
        title="Delete Team"
        description={`Are you sure you want to delete team "${deleteTeamTarget?.name}"? Members assigned to this team will become unassigned.`}
        actionLabel="Delete Team"
        variant="destructive"
        onConfirm={handleDeleteTeam}
      />

      {/* Remove Member Confirmation */}
      <ConfirmDialog
        open={!!removeMemberTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveMemberTarget(null);
        }}
        title="Remove Team Member"
        description={`Remove member "${removeMemberTarget?.user.displayName || removeMemberTarget?.user.username}" from team "${removeMemberTarget?.team.name}"?`}
        actionLabel="Remove Member"
        variant="destructive"
        onConfirm={handleRemoveMember}
      />

      {/* Search Input */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search teams or member names..."
          className="pl-8 text-xs"
        />
      </div>

      {/* Teams Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team Name</TableHead>
              <TableHead>Members (Max 3)</TableHead>
              <TableHead>Assigned Users</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTeams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                  No teams found.
                </TableCell>
              </TableRow>
            ) : (
              filteredTeams.map((t) => {
                const membersCount = t.members?.length || 0;
                const isFull = membersCount >= 3;

                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-semibold text-xs font-mono">{t.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={isFull ? "default" : "secondary"}
                        className="font-mono text-[11px]"
                      >
                        {membersCount} / 3
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {membersCount === 0 ? (
                        <span className="text-muted-foreground italic">No members assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {t.members?.map((m) => (
                            <Badge
                              key={m.id}
                              variant="outline"
                              className="font-mono text-[11px] gap-1 py-0.5"
                            >
                              <span>{m.displayName || m.username}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setRemoveMemberTarget({ team: t, user: m })}
                                disabled={pending}
                                title="Remove Member"
                                className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive p-0 ml-1"
                              >
                                <UserMinus className="h-3 w-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setAddMemberTarget(t);
                            setSelectedUserId("");
                            setError(null);
                          }}
                          disabled={pending || isFull}
                          title={isFull ? "Team capacity reached (max 3)" : "Add Member"}
                          className="h-8 w-8"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditTeamTarget(t);
                            setEditTeamName(t.name);
                            setError(null);
                          }}
                          disabled={pending}
                          title="Rename Team"
                          className="h-8 w-8"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTeamTarget(t)}
                          disabled={pending}
                          title="Delete Team"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
