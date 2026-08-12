import { useState } from "react";
import {
  KeyRound,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Users2,
  Users,
  Shield,
  Plus,
  Upload,
  Search,
} from "lucide-react";
import {
  createUserAction,
  bulkCreateUsersAction,
  resetPasswordAction,
  deleteUserAction,
} from "@/lib/actions/users";
import {
  setProctorAccessAction,
  toggleProctorExemptionAction,
} from "@/actions/telemetry";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
} from "@/lib/actions/teams";
import type { User, CreateUserInput, BulkResult } from "@/types/user";
import type { Team } from "@/types/team";
import { ConfirmDialog } from "./confirm-dialog";
import { CredentialsAlert } from "./credentials-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Credential = { username: string; password: string };
type AccessGrant = { webWithAgent: boolean; webOnly: boolean };
const FALLBACKS: {
  key: keyof AccessGrant;
  label: string;
  badge: string;
  className: string;
  cost: string;
  reasonHint: string;
}[] = [
  {
    key: "webWithAgent",
    label: "Browser, proctor running",
    badge: "BROWSER +AGENT",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    cost: "Allows scored submissions from an ordinary browser, as long as the proctor client keeps reporting from the same machine. Endpoint signals still land; nothing corroborates which window the code was typed in.",
    reasonHint: "Desktop shell will not open on this machine",
  },
  {
    key: "webOnly",
    label: "Browser, no proctor",
    badge: "BROWSER ONLY",
    className: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    cost: "Allows scored submissions from a browser with no proctor client at all. No endpoint signals will exist for this contestant.",
    reasonHint: "Proctor client cannot be installed on this machine",
  },
];

function grantOf(user: User): AccessGrant {
  return {
    webWithAgent: user.proctorAllowWebWithAgent ?? false,
    webOnly: user.proctorAllowWebOnly ?? false,
  };
}

function isPerverse(grant: AccessGrant): boolean {
  return grant.webOnly && !grant.webWithAgent;
}

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
  const [subTab, setSubTab] = useState<"competitors" | "admins">("competitors");
  const [searchQuery, setSearchQuery] = useState("");

  const [creds, setCreds] = useState<Credential[]>([]);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [assignTeamTarget, setAssignTeamTarget] = useState<User | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAssignTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!assignTeamTarget) return;
    setError(null);
    setPending(true);
    try {
      if (assignTeamTarget.teamId) {
        await removeTeamMemberAction(
          assignTeamTarget.teamId,
          assignTeamTarget.id,
        );
      }
      if (selectedTeamId) {
        await addTeamMemberAction(selectedTeamId, {
          userId: assignTeamTarget.id,
        });
      }
      setAssignTeamTarget(null);
      setSelectedTeamId("");
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleToggleExemption(user: User) {
    const isExempt = user.proctorExempt ?? false;
    let reason = "";
    if (!isExempt) {
      const entered = window.prompt(
        `An exemption switches proctoring OFF for ${user.displayName || user.username} entirely, for 4 hours. To let them work in a browser while the proctor keeps running, use Submission Access instead.\n\nReason:`,
        "Break-glass: proctor client unusable during competition",
      );
      if (entered === null || entered.trim() === "") return;
      reason = entered.trim();
    }

    setPending(true);
    user.proctorExempt = !isExempt;
    try {
      const res = await toggleProctorExemptionAction(
        user.id,
        !isExempt,
        reason,
      );
      if (res.error) {
        user.proctorExempt = isExempt; // Rollback on error
        setError(res.error);
      } else {
        onRefresh();
      }
    } catch {
      user.proctorExempt = isExempt; // Rollback on error
    } finally {
      setPending(false);
    }
  }

  async function handleFallbackToggle(
    user: User,
    key: keyof AccessGrant,
    enabled: boolean,
  ) {
    const current = grantOf(user);
    const next = { ...current, [key]: enabled };
    const fallback = FALLBACKS.find((entry) => entry.key === key)!;

    let reason = user.proctorAccessReason ?? "";
    if (enabled) {
      const entered = window.prompt(
        `${fallback.cost}\n\nFor ${user.displayName || user.username}. Reason (recorded against every submission they make):`,
        reason || fallback.reasonHint,
      );
      if (entered === null || entered.trim() === "") return;
      reason = entered.trim();

      // Asked, not silently corrected: this pair really does mean the contestant
      // must stop proctoring to submit, and an organizer who meant it keeps it.
      if (isPerverse(next)) {
        const proceed = window.confirm(
          `Careful: ${user.displayName || user.username} would be able to submit only while the proctor client is STOPPED — submissions from a browser with it running would still be refused.\n\nTick "Browser, proctor running" as well unless you specifically want that. Save anyway?`,
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
        user.proctorAllowWebWithAgent = current.webWithAgent; // Rollback on error
        user.proctorAllowWebOnly = current.webOnly;
        setError(res.error);
      } else {
        onRefresh();
      }
    } catch {
      user.proctorAllowWebWithAgent = current.webWithAgent; // Rollback on error
      user.proctorAllowWebOnly = current.webOnly;
      setError("Failed to update submission access");
    } finally {
      setPending(false);
    }
  }

  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"competitor" | "admin">("competitor");
  const [password, setPassword] = useState("");

  const [csvText, setCsvText] = useState("");

  const competitorUsers = users.filter((u) => u.role === "competitor");
  const adminUsers = users.filter((u) => u.role === "admin");

  const currentList = subTab === "competitors" ? competitorUsers : adminUsers;
  const filteredUsers = currentList.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.displayName &&
        u.displayName.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  function openAddFormFor(targetRole: "competitor" | "admin") {
    setRole(targetRole);
    setShowAddForm(true);
    setShowBulkForm(false);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const data = await createUserAction({
        username,
        displayName,
        role,
        password,
      });
      if (data.password) {
        setCreds((prev) => [
          { username: data.user.username, password: data.password! },
          ...prev,
        ]);
      }
      setUsername("");
      setDisplayName("");
      setPassword("");
      setShowAddForm(false);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const rows = parseCsv(csvText);
      if (rows.length === 0) throw new Error("No valid rows found");

      const data = await bulkCreateUsersAction("competitor", rows);
      const createdCreds = (data.results as BulkResult[])
        .filter((r) => r.status === "created" && r.password)
        .map((r) => ({ username: r.username, password: r.password! }));

      setCreds((prev) => [...createdCreds, ...prev]);
      setCsvText("");
      setShowBulkForm(false);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function confirmResetPassword() {
    if (!resetTarget) return;
    const target = resetTarget;
    setResetTarget(null);
    setError(null);
    setPending(true);
    try {
      const data = await resetPasswordAction(target.id);
      setCreds((prev) => [
        { username: target.username, password: data.password },
        ...prev,
      ]);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setError(null);
    setPending(true);
    try {
      await deleteUserAction(id);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-Tab Navigation Bar & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <Tabs
          value={subTab}
          onValueChange={(v) => setSubTab(v as "competitors" | "admins")}
        >
          <TabsList className="h-8">
            <TabsTrigger value="competitors" className="gap-1.5 text-xs h-7">
              <Users className="h-3.5 w-3.5" /> Contestants & Competitors (
              {competitorUsers.length})
            </TabsTrigger>
            <TabsTrigger value="admins" className="gap-1.5 text-xs h-7">
              <Shield className="h-3.5 w-3.5" /> Organizers & Admins (
              {adminUsers.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {subTab === "competitors" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowBulkForm(!showBulkForm);
                setShowAddForm(false);
              }}
              className="h-8 text-xs gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" /> Bulk CSV Import
            </Button>
          )}

          <Button
            size="sm"
            onClick={() =>
              openAddFormFor(subTab === "competitors" ? "competitor" : "admin")
            }
            className="h-8 text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add{" "}
            {subTab === "competitors" ? "Competitor" : "Admin"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      {/* Generated Credentials Alert Component */}
      <CredentialsAlert credentials={creds} onClear={() => setCreds([])} />

      {/* Single Add User Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateUser}
          className="rounded-lg border p-4 bg-muted/10 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Username
            </label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. competitor_01"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Display Name
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Assigned Role
            </label>
            <Input
              value={role}
              readOnly
              className="h-9 w-full bg-muted/20 font-mono text-xs cursor-not-allowed"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} size="sm">
              Save Account
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Bulk CSV Import Form */}
      {showBulkForm && (
        <form
          onSubmit={handleBulkImport}
          className="rounded-lg border p-4 bg-muted/10 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              CSV Competitors List (Format: username, display_name, password)
            </label>
            <span className="text-[10px] text-muted-foreground">
              Passwords auto-generated if omitted
            </span>
          </div>
          <Textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={4}
            placeholder={
              "alice, Alice Smith, secret123\nbob, Bob Jones\ncharlie, Charlie Brown"
            }
            className="font-mono text-xs"
            required
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowBulkForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} size="sm">
              Run Bulk Import
            </Button>
          </div>
        </form>
      )}

      {/* Search & Filter Bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${subTab === "competitors" ? "competitors" : "admins"} by username or name...`}
          className="pl-8 text-xs"
        />
      </div>

      {/* Users Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Assigned Team</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Proctoring</TableHead>
              <TableHead>Submission Access</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="p-8 text-center text-xs text-muted-foreground"
                >
                  No{" "}
                  {subTab === "competitors" ? "competitors" : "administrators"}{" "}
                  found.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    {u.username}
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.displayName || "-"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {u.teamName ? (
                      <Badge
                        variant="secondary"
                        className="font-mono text-[11px]"
                      >
                        {u.teamName}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="font-mono text-[11px] capitalize"
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.role === "competitor" ? (
                      u.proctorExempt ? (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        >
                          EXEMPT
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] text-muted-foreground"
                        >
                          ENFORCED
                        </Badge>
                      )
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {u.role === "competitor" ? (
                      <div className="flex flex-col gap-1">
                        {FALLBACKS.map((fallback) => {
                          const on = grantOf(u)[fallback.key];
                          return (
                            <label
                              key={fallback.key}
                              className="flex items-center gap-1.5 text-[11px] cursor-pointer"
                              title={fallback.cost}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={pending}
                                onChange={(e) =>
                                  handleFallbackToggle(
                                    u,
                                    fallback.key,
                                    e.target.checked,
                                  )
                                }
                                className="size-3 accent-primary"
                              />
                              <span
                                className={
                                  on
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground"
                                }
                              >
                                {fallback.label}
                              </span>
                            </label>
                          );
                        })}
                        {isPerverse(grantOf(u)) && (
                          <span
                            className="text-[10px] font-semibold text-rose-400"
                            title="This competitor can submit only while the proctor client is stopped."
                          >
                            ⚠ ONLY WITH PROCTOR STOPPED
                          </span>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {u.role === "competitor" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleExemption(u)}
                            disabled={pending}
                            title={
                              u.proctorExempt
                                ? "Revoke Proctor Exemption (Enforce)"
                                : "Grant Proctor Exemption (Break-glass: proctoring off for 4h)"
                            }
                            className={`h-8 w-8 ${u.proctorExempt ? "text-emerald-500 hover:bg-emerald-500/10" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {u.proctorExempt ? (
                              <ShieldOff className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <ShieldCheck className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setAssignTeamTarget(u);
                              setSelectedTeamId(u.teamId || "");
                            }}
                            disabled={pending}
                            title={
                              u.teamId
                                ? "Change / Remove Team"
                                : "Assign to Team"
                            }
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <Users2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setResetTarget(u)}
                        disabled={pending}
                        title="Reset Password"
                        className="h-8 w-8"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(u)}
                        disabled={pending || u.id === currentUserId}
                        title="Delete User"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Assign Team Modal */}
      {assignTeamTarget && (
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-sm font-semibold">
              Assign Team for{" "}
              {assignTeamTarget.displayName || assignTeamTarget.username}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAssignTeamTarget(null)}
              className="h-7 text-xs text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
          <form onSubmit={handleAssignTeam} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Select Team</label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">-- No Team (Unassigned) --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Members: {t.members?.length || 0}/3)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAssignTeamTarget(null)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                className="h-8 text-xs font-medium"
              >
                {pending ? "Saving..." : "Save Assignment"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title="Reset User Password"
        description={
          <>
            Are you sure you want to generate a new password for{" "}
            <strong className="text-foreground">
              {resetTarget?.displayName || resetTarget?.username}
            </strong>
            ?
          </>
        }
        actionLabel="Reset Password"
        onConfirm={confirmResetPassword}
      />

      {/* Delete User Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete User Account"
        description={
          <>
            Are you sure you want to delete user account{" "}
            <strong className="text-foreground">
              {deleteTarget?.username}
            </strong>
            ? All submission history associated with this user will be removed.
          </>
        }
        actionLabel="Delete User"
        variant="destructive"
        onConfirm={confirmDeleteUser}
      />
    </div>
  );
}

function parseCsv(text: string): CreateUserInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^username\b/i.test(line))
    .map((line) => {
      const [username, displayName, password] = line
        .split(",")
        .map((s) => s?.trim());
      return {
        username,
        displayName: displayName || undefined,
        password: password || undefined,
      };
    })
    .filter((u) => u.username);
}
