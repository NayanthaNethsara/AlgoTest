"use client";

import { useState } from "react";
import { AlertTriangleIcon, PlusIcon, RefreshCwIcon, ShieldIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import {
  createUserAction,
  bulkCreateUsersAction,
  resetPasswordAction,
  deleteUserAction,
  suspendUserAction,
  bulkUserAction,
} from "@/lib/actions/users";
import { setProctorAccessAction, toggleProctorExemptionAction } from "@/lib/actions/monitoring";
import { addTeamMemberAction, removeTeamMemberAction } from "@/lib/actions/teams";
import type { User, CreateUserInput } from "@/types/user";
import type { Team } from "@/types/team";
import { getErrorMessage } from "@/lib/errors";
import { ConfirmDialog } from "./confirm-dialog";
import { CredentialsAlert } from "./credentials-alert";
import { PageHeader } from "@/components/shell/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { UserTable } from "./users/user-table";
import { UserCreateDialog } from "./users/user-create-dialog";
import { UserBulkDialog } from "./users/user-bulk-dialog";
import { UserTeamDialog } from "./users/user-team-dialog";
import { AccessReasonDialog, type AccessReasonRequest } from "./proctoring/access-reason-dialog";
import {
  type Credential,
  type AccessGrant,
  type ParsedCsvRow,
  FALLBACKS,
  grantOf,
} from "./users/types";

/** An override that still needs its audit reason before it can be applied. */
type PendingOverride =
  { kind: "exemption"; user: User } | { kind: "fallback"; user: User; key: keyof AccessGrant };

export function AdminUsers({
  users,
  teams = [],
  currentUserId,
  onRefresh,
  refreshing = false,
  loadError = null,
}: {
  users: User[];
  teams?: Team[];
  currentUserId?: string;
  onRefresh: () => void;
  refreshing?: boolean;
  loadError?: string | null;
}) {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [assignTeamTarget, setAssignTeamTarget] = useState<User | null>(null);
  const [pendingOverride, setPendingOverride] = useState<PendingOverride | null>(null);

  const [pending, setPending] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<{ username: string; error: string }[]>([]);

  const competitorCount = users.filter((u) => u.role === "competitor").length;

  async function handleCreateUser(payload: CreateUserInput) {
    setPending(true);
    try {
      const data = await createUserAction(payload);
      if (data.password) {
        setCreds((prev) => [
          { username: data.user.username, password: data.password!, teamName: data.user.teamName },
          ...prev,
        ]);
      }
      setShowAddForm(false);
      toast.success("Competitor created", { description: data.user.username });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create the competitor."));
    } finally {
      setPending(false);
    }
  }

  async function handleBulkCreate(parsedRows: ParsedCsvRow[]) {
    setBulkErrors([]);
    setPending(true);

    const rows = parsedRows.map((r) => ({
      username: r.username,
      displayName: r.displayName,
      teamName: r.teamName,
      password: r.password,
    }));

    try {
      const { results } = await bulkCreateUsersAction(rows);

      const createdCredentials = results
        .filter((r) => r.status === "created" && r.password)
        .map((r) => ({
          username: r.username,
          password: r.password!,
          teamName: r.teamName || r.user?.teamName,
        }));

      if (createdCredentials.length > 0) {
        setCreds((prev) => [...createdCredentials, ...prev]);
      }

      const failedResults = results
        .filter((r) => r.status === "error")
        .map((r) => ({ username: r.username, error: r.error || "Creation failed" }));

      if (failedResults.length > 0) {
        setBulkErrors(failedResults);
        toast.warning(`${createdCredentials.length} created, ${failedResults.length} failed`, {
          description: "Review the failed rows listed in the import panel.",
        });
      } else {
        setShowBulkForm(false);
        toast.success(`${createdCredentials.length} competitor(s) imported`);
      }

      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to import users."));
    } finally {
      setPending(false);
    }
  }

  async function handleAssignTeam(userId: string, targetTeamId: string) {
    if (!assignTeamTarget) return;
    const previousTeamId = assignTeamTarget.teamId;
    if (previousTeamId === targetTeamId) {
      setAssignTeamTarget(null);
      return;
    }

    setPending(true);
    try {
      if (previousTeamId) {
        await removeTeamMemberAction(previousTeamId, userId);
      }
      if (targetTeamId) {
        await addTeamMemberAction(targetTeamId, { userId });
      }
      setAssignTeamTarget(null);
      toast.success(targetTeamId ? "Team assignment updated" : "Removed from team");
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the team assignment."));
    } finally {
      setPending(false);
    }
  }

  function requestExemptionToggle(user: User) {
    if (user.proctorExempt) {
      void applyExemption(user, false, "");
      return;
    }
    setPendingOverride({ kind: "exemption", user });
  }

  function requestFallbackToggle(user: User, key: keyof AccessGrant, enabled: boolean) {
    if (!enabled) {
      void applyFallback(user, key, false, user.proctorAccessReason ?? "");
      return;
    }
    setPendingOverride({ kind: "fallback", user, key });
  }

  async function applyExemption(user: User, enabled: boolean, reason: string) {
    setPending(true);
    try {
      const res = await toggleProctorExemptionAction(user.id, enabled, reason);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(enabled ? "Proctoring exemption granted" : "Proctoring exemption revoked", {
        description: user.displayName || user.username,
      });
      setPendingOverride(null);
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the proctoring exemption."));
    } finally {
      setPending(false);
    }
  }

  async function applyFallback(
    user: User,
    key: keyof AccessGrant,
    enabled: boolean,
    reason: string
  ) {
    const next = { ...grantOf(user), [key]: enabled };
    setPending(true);
    try {
      const res = await setProctorAccessAction(user.id, next, reason, 0);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(enabled ? "Submission override granted" : "Submission override revoked", {
        description: user.displayName || user.username,
      });
      setPendingOverride(null);
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update submission access."));
    } finally {
      setPending(false);
    }
  }

  function confirmOverride(reason: string) {
    if (!pendingOverride) return;
    if (pendingOverride.kind === "exemption") {
      void applyExemption(pendingOverride.user, true, reason);
    } else {
      void applyFallback(pendingOverride.user, pendingOverride.key, true, reason);
    }
  }

  async function confirmResetPassword() {
    if (!resetTarget) return;
    const target = resetTarget;
    setResetTarget(null);
    setPending(true);
    try {
      const data = await resetPasswordAction(target.id);
      setCreds((prev) => [
        { username: target.username, password: data.password, teamName: target.teamName },
        ...prev,
      ]);
      toast.success("Password reset", {
        description: `New credentials shown for ${target.username}.`,
      });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to reset the password."));
    } finally {
      setPending(false);
    }
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setPending(true);
    try {
      await deleteUserAction(target.id);
      toast.success("User deleted", { description: target.username });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete the user."));
    } finally {
      setPending(false);
    }
  }

  async function confirmToggleSuspension() {
    if (!suspendTarget) return;
    const target = suspendTarget;
    setSuspendTarget(null);
    setPending(true);
    try {
      await suspendUserAction(target.id, !target.isSuspended);
      toast.success(target.isSuspended ? "User restored" : "User suspended", {
        description: target.username,
      });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the suspension."));
    } finally {
      setPending(false);
    }
  }

  async function handleBulkToggleFallback(
    targetUsers: User[],
    key: keyof AccessGrant,
    enabled: boolean
  ) {
    if (targetUsers.length === 0) return;
    setPending(true);
    try {
      const res = await bulkUserAction({
        userIds: targetUsers.map((u) => u.id),
        action: enabled ? "allow_web_only" : "require_desktop",
        reason: "Bulk operation by organizer",
      });
      toast.success(
        `${enabled ? "Granted" : "Revoked"} browser-only access for ${res.affected} user(s).`
      );
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update submission access in bulk."));
    } finally {
      setPending(false);
    }
  }

  async function handleBulkToggleExemption(targetUsers: User[], exempt: boolean) {
    if (targetUsers.length === 0) return;
    setPending(true);
    try {
      const res = await bulkUserAction({
        userIds: targetUsers.map((u) => u.id),
        action: exempt ? "exempt_proctor" : "enforce_proctor",
        reason: "Bulk operation by organizer",
      });
      toast.success(
        `${exempt ? "Exempted" : "Enforced"} proctoring for ${res.affected} user(s).`
      );
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update proctor exemptions in bulk."));
    } finally {
      setPending(false);
    }
  }

  async function handleBulkToggleSuspension(targetUsers: User[], suspended: boolean) {
    if (targetUsers.length === 0) return;
    setPending(true);
    try {
      const res = await bulkUserAction({
        userIds: targetUsers.map((u) => u.id),
        action: suspended ? "suspend" : "restore",
        reason: "Bulk operation by organizer",
      });
      toast.success(
        `${suspended ? "Suspended" : "Restored"} ${res.affected} user(s).`
      );
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update user suspensions in bulk."));
    } finally {
      setPending(false);
    }
  }

  async function handleBulkDelete(targetUsers: User[]) {
    if (targetUsers.length === 0) return;
    setPending(true);
    try {
      const res = await bulkUserAction({
        userIds: targetUsers.map((u) => u.id),
        action: "delete",
      });
      toast.success(`Deleted ${res.affected} user(s).`);
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete users in bulk."));
    } finally {
      setPending(false);
    }
  }

  const overrideRequest = buildOverrideRequest(pendingOverride);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Users & competitors"
        description={`${competitorCount} competitor(s) · manage team membership, suspensions, and proctoring overrides.`}
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowBulkForm((open) => !open);
                setShowAddForm(false);
              }}
              className="gap-1.5"
            >
              <UploadIcon /> Bulk import
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setShowAddForm(true);
                setShowBulkForm(false);
              }}
              className="gap-1.5"
            >
              <PlusIcon /> Add competitor
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

      <div className="flex flex-col gap-2 rounded-xl border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-start gap-2">
          <ShieldIcon className="mt-px size-4 shrink-0 text-primary" />
          <span>
            Admin accounts are provisioned exclusively from the server command line (
            <code className="font-mono text-[11px] font-semibold text-foreground">
              cmd/usertool
            </code>
            ).
          </span>
        </span>
        <Badge variant="outline" className="w-fit shrink-0 font-mono text-[10px]">
          CLI guarded
        </Badge>
      </div>

      {showAddForm && (
        <UserCreateDialog
          teams={teams}
          pending={pending}
          onSubmit={handleCreateUser}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {showBulkForm && (
        <UserBulkDialog
          teams={teams}
          pending={pending}
          bulkErrors={bulkErrors}
          onSubmit={handleBulkCreate}
          onCancel={() => setShowBulkForm(false)}
        />
      )}

      <UserTable
        users={users}
        currentUserId={currentUserId}
        pending={pending}
        onResetPassword={setResetTarget}
        onDeleteUser={setDeleteTarget}
        onAssignTeam={setAssignTeamTarget}
        onToggleExemption={requestExemptionToggle}
        onToggleFallback={requestFallbackToggle}
        onToggleSuspension={setSuspendTarget}
        onBulkToggleFallback={handleBulkToggleFallback}
        onBulkToggleExemption={handleBulkToggleExemption}
        onBulkToggleSuspension={handleBulkToggleSuspension}
        onBulkDelete={handleBulkDelete}
      />

      {assignTeamTarget && (
        <UserTeamDialog
          user={assignTeamTarget}
          teams={teams}
          pending={pending}
          onSave={handleAssignTeam}
          onClose={() => setAssignTeamTarget(null)}
        />
      )}

      <AccessReasonDialog
        request={overrideRequest}
        pending={pending}
        onConfirm={confirmOverride}
        onCancel={() => setPendingOverride(null)}
      />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title="Reset password"
        description={
          <>
            Reset the password for{" "}
            <strong className="text-foreground">{resetTarget?.username}</strong>? A new password is
            generated and shown on screen once.
          </>
        }
        actionLabel="Reset password"
        onConfirm={confirmResetPassword}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete user"
        description={
          <>
            Permanently delete <strong className="text-foreground">{deleteTarget?.username}</strong>
            ? Their submissions and proctoring telemetry stay on record.
          </>
        }
        actionLabel="Delete user"
        variant="destructive"
        onConfirm={confirmDeleteUser}
      />

      <ConfirmDialog
        open={Boolean(suspendTarget)}
        onOpenChange={(open) => !open && setSuspendTarget(null)}
        title={suspendTarget?.isSuspended ? "Restore access" : "Suspend user"}
        description={
          suspendTarget?.isSuspended ? (
            <>
              Restore access for{" "}
              <strong className="text-foreground">{suspendTarget?.username}</strong>? They will be
              able to log in and submit again.
            </>
          ) : (
            <>
              Suspend <strong className="text-foreground">{suspendTarget?.username}</strong>? Active
              sessions end immediately and they are blocked from the platform.
            </>
          )
        }
        actionLabel={suspendTarget?.isSuspended ? "Restore access" : "Suspend user"}
        variant={suspendTarget?.isSuspended ? "default" : "destructive"}
        onConfirm={confirmToggleSuspension}
      />
    </div>
  );
}

function buildOverrideRequest(override: PendingOverride | null): AccessReasonRequest | null {
  if (!override) return null;
  const who = override.user.displayName || override.user.username;

  if (override.kind === "exemption") {
    return {
      title: "Grant proctoring exemption",
      consequence: `Proctoring is switched OFF entirely for ${who} for the next 4 hours.`,
      subject: who,
      defaultReason: "Break-glass: proctor client unusable during competition",
      confirmLabel: "Grant exemption",
    };
  }

  const fallback = FALLBACKS.find((entry) => entry.key === override.key);
  return {
    title: fallback?.label ?? "Grant submission override",
    consequence: fallback?.cost ?? "This grants a proctoring override for this competitor.",
    subject: who,
    defaultReason: override.user.proctorAccessReason ?? fallback?.reasonHint ?? "",
    confirmLabel: "Grant override",
  };
}
