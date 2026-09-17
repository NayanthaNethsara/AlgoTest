"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BanIcon,
  GlobeIcon,
  KeyRoundIcon,
  LaptopIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserCheckIcon,
  UsersIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/ui/search-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataPagination } from "@/components/shell/data-pagination";
import { EmptyState } from "@/components/shell/data-states";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import type { User } from "@/types/user";
import { FALLBACKS, grantOf, type AccessGrant } from "./types";

type SubTab = "competitors" | "admins";

interface UserTableProps {
  users: User[];
  currentUserId?: string;
  pending: boolean;
  onResetPassword: (user: User) => void;
  onDeleteUser: (user: User) => void;
  onAssignTeam: (user: User) => void;
  onToggleExemption: (user: User) => void;
  onToggleFallback: (user: User, key: keyof AccessGrant, enabled: boolean) => void;
  onToggleSuspension: (user: User) => void;
  onBulkToggleFallback?: (users: User[], key: keyof AccessGrant, enabled: boolean) => void;
  onBulkToggleExemption?: (users: User[], exempt: boolean) => void;
  onBulkToggleSuspension?: (users: User[], suspended: boolean) => void;
  onBulkDelete?: (users: User[]) => void;
}

export function UserTable({
  users,
  currentUserId,
  pending,
  onResetPassword,
  onDeleteUser,
  onAssignTeam,
  onToggleExemption,
  onToggleFallback,
  onToggleSuspension,
  onBulkToggleFallback,
  onBulkToggleExemption,
  onBulkToggleSuspension,
  onBulkDelete,
}: UserTableProps) {
  const [subTab, setSubTab] = useState<SubTab>("competitors");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<User[] | null>(null);

  const { competitorUsers, adminUsers } = useMemo(
    () => ({
      competitorUsers: users.filter((u) => u.role === "competitor"),
      adminUsers: users.filter((u) => u.role === "admin"),
    }),
    [users]
  );

  const isCompetitorTab = subTab === "competitors";
  const currentList = isCompetitorTab ? competitorUsers : adminUsers;

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return currentList;
    return currentList.filter(
      (u) =>
        u.username.toLowerCase().includes(query) ||
        u.displayName?.toLowerCase().includes(query) ||
        u.teamName?.toLowerCase().includes(query)
    );
  }, [currentList, searchQuery]);

  const pagination = usePagination(filteredUsers);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [subTab, searchQuery]);

  const selectedUsers = useMemo(() => {
    return filteredUsers.filter((u) => selectedIds.has(u.id));
  }, [filteredUsers, selectedIds]);

  const isAllSelected =
    pagination.items.length > 0 && pagination.items.every((u) => selectedIds.has(u.id));
  const isSomeSelected =
    !isAllSelected && pagination.items.some((u) => selectedIds.has(u.id));

  function handleToggleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        pagination.items.forEach((u) => next.add(u.id));
      } else {
        pagination.items.forEach((u) => next.delete(u.id));
      }
      return next;
    });
  }

  function handleToggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as SubTab)}>
          <TabsList className="h-8">
            <TabsTrigger value="competitors" className="h-7 gap-1.5 text-xs">
              Competitors
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {competitorUsers.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="admins" className="h-7 gap-1.5 text-xs">
              Admins
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {adminUsers.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <SearchInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search name, username, or team…"
          className="sm:max-w-xs"
        />
      </div>

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 p-2.5 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {selectedUsers.length} selected
            </Badge>
            {selectedUsers.length < filteredUsers.length && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(filteredUsers.map((u) => u.id)))}
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                Select all {filteredUsers.length}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isCompetitorTab && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkToggleFallback?.(selectedUsers, "webOnly", true)}
                  disabled={pending}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <GlobeIcon className="size-3 text-primary" /> Allow Browser
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkToggleFallback?.(selectedUsers, "webOnly", false)}
                  disabled={pending}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <LaptopIcon className="size-3" /> Require Desktop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkToggleExemption?.(selectedUsers, true)}
                  disabled={pending}
                  className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                >
                  <ShieldOffIcon className="size-3" /> Exempt Proctoring
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkToggleExemption?.(selectedUsers, false)}
                  disabled={pending}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <ShieldCheckIcon className="size-3 text-success" /> Enforce Proctoring
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkToggleSuspension?.(selectedUsers, true)}
              disabled={pending}
              className="h-7 gap-1 px-2 text-xs"
            >
              <BanIcon className="size-3" /> Suspend
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkToggleSuspension?.(selectedUsers, false)}
              disabled={pending}
              className="h-7 gap-1 px-2 text-xs"
            >
              <UserCheckIcon className="size-3 text-success" /> Restore
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkDeleteTarget(selectedUsers)}
              disabled={pending}
              className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            >
              <Trash2Icon className="size-3" /> Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              disabled={pending}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            >
              <XIcon className="size-3" /> Clear
            </Button>
          </div>
        </div>
      )}

      {filteredUsers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={
            searchQuery ? "No matching users" : isCompetitorTab ? "No competitors yet" : "No admins"
          }
          description={
            searchQuery
              ? "Try a different name, username, or team."
              : isCompetitorTab
                ? "Add a competitor or import a roster to get started."
                : "Admin accounts are provisioned from the server CLI."
          }
          action={
            searchQuery ? (
              <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={isSomeSelected}
                    onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                    aria-label="Select all on this page"
                  />
                </TableHead>
                <TableHead>User</TableHead>
                {isCompetitorTab && <TableHead>Team</TableHead>}
                <TableHead>Role</TableHead>
                {isCompetitorTab && <TableHead>Submission access</TableHead>}
                {isCompetitorTab && <TableHead>Proctoring</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items.map((u) => {
                const grant = grantOf(u);
                const isSelf = u.id === currentUserId;

                return (
                  <TableRow
                    key={u.id}
                    className={cn(
                      u.isSuspended && "bg-destructive/5",
                      selectedIds.has(u.id) && "bg-primary/5"
                    )}
                  >
                    <TableCell className="w-10 px-3">
                      <Checkbox
                        checked={selectedIds.has(u.id)}
                        onCheckedChange={(checked) => handleToggleRow(u.id, Boolean(checked))}
                        aria-label={`Select ${u.displayName || u.username}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">
                          {u.displayName || u.username}
                        </span>
                        {isSelf && (
                          <Badge variant="outline" className="py-0 text-[10px]">
                            You
                          </Badge>
                        )}
                        {u.isSuspended && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Badge variant="destructive" className="py-0 text-[10px]">
                                  Suspended
                                </Badge>
                              }
                            />
                            <TooltipContent>
                              {u.suspendedReason || "Suspended by an organizer"}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {u.username}
                      </div>
                    </TableCell>

                    {isCompetitorTab && (
                      <TableCell>
                        {u.teamName ? (
                          <Badge variant="outline" className="text-[11px]">
                            {u.teamName}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-warning">No team</span>
                        )}
                      </TableCell>
                    )}

                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {u.role}
                      </Badge>
                    </TableCell>

                    {isCompetitorTab && (
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {FALLBACKS.map((f) => {
                            const active = grant[f.key];
                            return (
                              <Tooltip key={f.key}>
                                <TooltipTrigger
                                  render={
                                    <button
                                      type="button"
                                      onClick={() => onToggleFallback(u, f.key, !active)}
                                      disabled={pending}
                                      aria-pressed={active}
                                      className={cn(
                                        "rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                                        active
                                          ? f.className
                                          : "border-transparent bg-muted/40 text-muted-foreground hover:border-border"
                                      )}
                                    />
                                  }
                                >
                                  {f.badge}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {active ? `Revoke — ${f.cost}` : f.cost}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </TableCell>
                    )}

                    {isCompetitorTab && (
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onToggleExemption(u)}
                                disabled={pending}
                                aria-pressed={Boolean(u.proctorExempt)}
                                className="gap-1.5 px-2 text-[11px]"
                              />
                            }
                          >
                            {u.proctorExempt ? (
                              <>
                                <ShieldOffIcon className="text-destructive" />
                                <span className="font-medium text-destructive">Exempt</span>
                              </>
                            ) : (
                              <>
                                <ShieldCheckIcon className="text-muted-foreground" />
                                <span className="text-muted-foreground">Enforced</span>
                              </>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            {u.proctorExempt
                              ? "Revoke the proctoring exemption"
                              : "Grant a time-boxed proctoring exemption"}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    )}

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {isCompetitorTab && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => onAssignTeam(u)}
                                  disabled={pending}
                                  aria-label={`Assign team for ${u.username}`}
                                />
                              }
                            >
                              <UsersRoundIcon />
                            </TooltipTrigger>
                            <TooltipContent>Assign team</TooltipContent>
                          </Tooltip>
                        )}

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onToggleSuspension(u)}
                                disabled={pending || isSelf || u.role === "admin"}
                                aria-label={
                                  u.isSuspended ? `Restore ${u.username}` : `Suspend ${u.username}`
                                }
                                className={cn(
                                  "text-muted-foreground hover:bg-warning/10 hover:text-warning",
                                  u.isSuspended && "text-warning"
                                )}
                              />
                            }
                          >
                            {u.isSuspended ? <UserCheckIcon /> : <BanIcon />}
                          </TooltipTrigger>
                          <TooltipContent>
                            {isSelf
                              ? "You cannot suspend yourself"
                              : u.role === "admin"
                                ? "Admin accounts cannot be suspended via console"
                                : u.isSuspended
                                  ? "Restore access"
                                  : "Suspend user"}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onResetPassword(u)}
                                disabled={pending || (u.role === "admin" && !isSelf)}
                                aria-label={`Reset password for ${u.username}`}
                              />
                            }
                          >
                            <KeyRoundIcon />
                          </TooltipTrigger>
                          <TooltipContent>
                            {u.role === "admin" && !isSelf
                              ? "Admin passwords must be reset via server CLI"
                              : "Reset password"}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onDeleteUser(u)}
                                disabled={pending || isSelf || u.role === "admin"}
                                aria-label={`Delete ${u.username}`}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              />
                            }
                          >
                            <Trash2Icon />
                          </TooltipTrigger>
                          <TooltipContent>
                            {isSelf
                              ? "You cannot delete yourself"
                              : u.role === "admin"
                                ? "Admin accounts cannot be deleted via console"
                                : "Delete user"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <DataPagination state={pagination} itemLabel="user" />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(bulkDeleteTarget)}
        onOpenChange={(open) => !open && setBulkDeleteTarget(null)}
        title={`Delete ${bulkDeleteTarget?.length ?? 0} Users`}
        description={
          <>
            Permanently delete{" "}
            <strong className="text-foreground">{bulkDeleteTarget?.length}</strong> selected users?
            Their submissions and telemetry will stay on record.
          </>
        }
        actionLabel={`Delete ${bulkDeleteTarget?.length ?? 0} Users`}
        variant="destructive"
        onConfirm={() => {
          if (bulkDeleteTarget) {
            onBulkDelete?.(bulkDeleteTarget);
            setBulkDeleteTarget(null);
            clearSelection();
          }
        }}
      />
    </div>
  );
}
