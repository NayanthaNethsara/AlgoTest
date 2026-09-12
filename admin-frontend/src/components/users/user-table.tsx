"use client";

import { useMemo, useState } from "react";
import {
  BanIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserCheckIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
}: UserTableProps) {
  const [subTab, setSubTab] = useState<SubTab>("competitors");
  const [searchQuery, setSearchQuery] = useState("");

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
                  <TableRow key={u.id} className={cn(u.isSuspended && "bg-destructive/5")}>
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
                                disabled={pending || isSelf}
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
                                disabled={pending}
                                aria-label={`Reset password for ${u.username}`}
                              />
                            }
                          >
                            <KeyRoundIcon />
                          </TooltipTrigger>
                          <TooltipContent>Reset password</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onDeleteUser(u)}
                                disabled={pending || isSelf}
                                aria-label={`Delete ${u.username}`}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              />
                            }
                          >
                            <Trash2Icon />
                          </TooltipTrigger>
                          <TooltipContent>
                            {isSelf ? "You cannot delete yourself" : "Delete user"}
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
    </div>
  );
}
