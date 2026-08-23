"use client";

import { useState } from "react";
import { Plus, Upload, Shield, AlertCircle } from "lucide-react";
import {
  createUserAction,
  bulkCreateUsersAction,
  resetPasswordAction,
  deleteUserAction,
} from "@/lib/actions/users";
import { setProctorAccessAction, toggleProctorExemptionAction } from "@/actions/telemetry";
import { addTeamMemberAction, removeTeamMemberAction } from "@/lib/actions/teams";
import type { User, CreateUserInput } from "@/types/user";
import type { Team } from "@/types/team";
import { ConfirmDialog } from "./confirm-dialog";
import { CredentialsAlert } from "./credentials-alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserTable } from "./users/user-table";
import { UserCreateDialog } from "./users/user-create-dialog";
import { UserBulkDialog } from "./users/user-bulk-dialog";
import { UserTeamDialog } from "./users/user-team-dialog";
import {
  type Credential,
  type AccessGrant,
  type ParsedCsvRow,
  FALLBACKS,
  grantOf,
  isPerverse,
} from "./users/types";

export function AdminUsers({
  users,
  teams = [],
  currentUserId,
  onRefresh,
}: {
  users: User[];
  teams?: Team[];
  currentUserId?: string;
  onRefresh: () => void;
}) {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [assignTeamTarget, setAssignTeamTarget] = useState<User | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<{ username: string; error: string }[]>([]);

  // Single User Create Handler
  async function handleCreateUser(payload: CreateUserInput) {
    setError(null);
    setPending(true);
    try {
      const data = await createUserAction(payload);
      if (data.password) {
        setCreds((prev) => [
          {
            username: data.user.username,
            password: data.password!,
            teamName: data.user.teamName,
          },
          ...prev,
        ]);
      }
      setShowAddForm(false);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to create competitor.");
    } finally {
      setPending(false);
    }
  }

  // Bulk Users Create Handler
  async function handleBulkCreate(parsedRows: ParsedCsvRow[]) {
    setError(null);
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
        setError(`${failedResults.length} user(s) could not be created.`);
      } else {
        setShowBulkForm(false);
      }

      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to import bulk users.");
    } finally {
      setPending(false);
    }
  }

  // Team Assignment Handler
  async function handleAssignTeam(userId: string, targetTeamId: string) {
    if (!assignTeamTarget) return;
    setError(null);
    setPending(true);
    try {
      if (assignTeamTarget.teamId && assignTeamTarget.teamId !== targetTeamId) {
        await removeTeamMemberAction(assignTeamTarget.teamId, userId);
      }
      if (targetTeamId && assignTeamTarget.teamId !== targetTeamId) {
        await addTeamMemberAction(targetTeamId, { userId });
      }
      setAssignTeamTarget(null);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  // Proctor Exemption Toggle
  async function handleToggleExemption(user: User) {
    const isExempt = user.proctorExempt ?? false;
    let reason = "";
    if (!isExempt) {
      const entered = window.prompt(
        `An exemption switches proctoring OFF for ${
          user.displayName || user.username
        } entirely, for 4 hours.\n\nReason:`,
        "Break-glass: proctor client unusable during competition"
      );
      if (entered === null || entered.trim() === "") return;
      reason = entered.trim();
    }

    setPending(true);
    user.proctorExempt = !isExempt;
    try {
      const res = await toggleProctorExemptionAction(user.id, !isExempt, reason);
      if (res.error) {
        user.proctorExempt = isExempt;
        setError(res.error);
      } else {
        onRefresh();
      }
    } catch {
      user.proctorExempt = isExempt;
    } finally {
      setPending(false);
    }
  }

  // Proctor Fallback Access Toggle
  async function handleFallbackToggle(user: User, key: keyof AccessGrant, enabled: boolean) {
    const current = grantOf(user);
    const next = { ...current, [key]: enabled };
    const fallback = FALLBACKS.find((entry) => entry.key === key)!;

    let reason = user.proctorAccessReason ?? "";
    if (enabled) {
      const entered = window.prompt(
        `${fallback.cost}\n\nFor ${
          user.displayName || user.username
        }. Reason (recorded against every submission):`,
        reason || fallback.reasonHint
      );
      if (entered === null || entered.trim() === "") return;
      reason = entered.trim();

      if (isPerverse(next)) {
        const proceed = window.confirm(
          `Careful: ${
            user.displayName || user.username
          } would be able to submit only while the proctor client is STOPPED. Save anyway?`
        );
        if (!proceed) return;
      }
    }

    setPending(true);
    setError(null);
    user.proctorAllowWebWithAgent = next.webWithAgent;
    user.proctorAllowWebOnly = next.webOnly;
    try {
      const res = await setProctorAccessAction(user.id, next, reason, 0);
      if (res.error) {
        user.proctorAllowWebWithAgent = current.webWithAgent;
        user.proctorAllowWebOnly = current.webOnly;
        setError(res.error);
      } else {
        onRefresh();
      }
    } catch {
      user.proctorAllowWebWithAgent = current.webWithAgent;
      user.proctorAllowWebOnly = current.webOnly;
      setError("Failed to update submission access");
    } finally {
      setPending(false);
    }
  }

  // Reset Password Handler
  async function confirmResetPassword() {
    if (!resetTarget) return;
    const target = resetTarget;
    setResetTarget(null);
    setError(null);
    setPending(true);
    try {
      const data = await resetPasswordAction(target.id);
      setCreds((prev) => [
        {
          username: target.username,
          password: data.password,
          teamName: target.teamName,
        },
        ...prev,
      ]);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  // Delete User Handler
  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setError(null);
    setPending(true);
    try {
      await deleteUserAction(target.id);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Users & Competitors</h2>
          <p className="text-xs text-muted-foreground">
            Manage competitors, team memberships, and proctoring exemptions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowBulkForm(!showBulkForm);
              setShowAddForm(false);
            }}
            className="gap-1.5 text-xs"
          >
            <Upload className="h-4 w-4" /> Bulk Import
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setShowAddForm(!showAddForm);
              setShowBulkForm(false);
            }}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-4 w-4" /> Add Competitor
          </Button>
        </div>
      </div>

      <CredentialsAlert credentials={creds} onClear={() => setCreds([])} />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Info Badge on Admin Provisioning */}
      <div className="rounded-md border bg-muted/20 px-3.5 py-2.5 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <span>
            Admin accounts are provisioned exclusively via the server command line (
            <code className="text-[11px] font-mono text-foreground font-semibold">
              cmd/usertool
            </code>
            ) for infrastructure security.
          </span>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          CLI Guarded
        </Badge>
      </div>

      {/* Conditional Forms */}
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

      {/* Main Users Table */}
      <UserTable
        users={users}
        currentUserId={currentUserId}
        pending={pending}
        onResetPassword={(u) => setResetTarget(u)}
        onDeleteUser={(u) => setDeleteTarget(u)}
        onAssignTeam={(u) => setAssignTeamTarget(u)}
        onToggleExemption={handleToggleExemption}
        onToggleFallback={handleFallbackToggle}
      />

      {/* Team Assignment Modal */}
      {assignTeamTarget && (
        <UserTeamDialog
          user={assignTeamTarget}
          teams={teams}
          pending={pending}
          onSave={handleAssignTeam}
          onClose={() => setAssignTeamTarget(null)}
        />
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title="Reset User Password"
        description={
          <>
            Are you sure you want to reset the password for{" "}
            <strong className="text-foreground">{resetTarget?.username}</strong>? A new secure
            password will be generated and shown on screen.
          </>
        }
        actionLabel="Reset Password"
        onConfirm={confirmResetPassword}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete User"
        description={
          <>
            Are you sure you want to permanently delete{" "}
            <strong className="text-foreground">{deleteTarget?.username}</strong>? All associated
            contest submissions and proctoring telemetry will remain recorded.
          </>
        }
        actionLabel="Delete User"
        variant="destructive"
        onConfirm={confirmDeleteUser}
      />
    </div>
  );
}
