"use client";

import {
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserMinusIcon,
  UserPlusIcon,
  Users2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataPagination } from "@/components/shell/data-pagination";
import { EmptyState } from "@/components/shell/data-states";
import { usePagination } from "@/hooks/use-pagination";
import type { Team } from "@/types/team";
import type { User } from "@/types/user";

interface TeamTableProps {
  teams: Team[];
  pending: boolean;
  searching?: boolean;
  onClearSearch?: () => void;
  onCreateTeam?: () => void;
  onEditTeam: (team: Team) => void;
  onDeleteTeam: (team: Team) => void;
  onAddMember: (team: Team) => void;
  onRemoveMember: (team: Team, user: User) => void;
}

export function TeamTable({
  teams,
  pending,
  searching = false,
  onClearSearch,
  onCreateTeam,
  onEditTeam,
  onDeleteTeam,
  onAddMember,
  onRemoveMember,
}: TeamTableProps) {
  const pagination = usePagination(teams);

  if (teams.length === 0) {
    return (
      <EmptyState
        icon={<Users2Icon />}
        title={searching ? "No matching teams" : "No teams yet"}
        description={
          searching
            ? "No team name or member matches that search."
            : "Create a team, then assign competitors to it."
        }
        action={
          searching ? (
            <Button variant="outline" size="sm" onClick={onClearSearch}>
              Clear search
            </Button>
          ) : (
            onCreateTeam && (
              <Button size="sm" onClick={onCreateTeam} className="gap-1.5">
                <PlusIcon /> Create team
              </Button>
            )
          )
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Team</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.items.map((t) => {
            const memberCount = t.members?.length ?? 0;
            return (
              <TableRow key={t.id}>
                <TableCell className="align-top">
                  <div className="text-xs font-medium">{t.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {memberCount} member{memberCount === 1 ? "" : "s"}
                  </div>
                </TableCell>

                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {memberCount > 0 ? (
                      t.members!.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs"
                        >
                          <span className="font-medium">{m.displayName || m.username}</span>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => onRemoveMember(t, m)}
                                  disabled={pending}
                                  aria-label={`Remove ${m.username} from ${t.name}`}
                                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                />
                              }
                            >
                              <UserMinusIcon />
                            </TooltipTrigger>
                            <TooltipContent>Remove from team</TooltipContent>
                          </Tooltip>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No members yet</span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="text-right align-top">
                  <div className="flex items-center justify-end gap-0.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onAddMember(t)}
                            disabled={pending}
                            aria-label={`Add a competitor to ${t.name}`}
                          />
                        }
                      >
                        <UserPlusIcon />
                      </TooltipTrigger>
                      <TooltipContent>Add member</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onEditTeam(t)}
                            disabled={pending}
                            aria-label={`Rename ${t.name}`}
                          />
                        }
                      >
                        <PencilIcon />
                      </TooltipTrigger>
                      <TooltipContent>Rename team</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onDeleteTeam(t)}
                            disabled={pending}
                            aria-label={`Delete ${t.name}`}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          />
                        }
                      >
                        <Trash2Icon />
                      </TooltipTrigger>
                      <TooltipContent>Delete team</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <DataPagination state={pagination} itemLabel="team" />
    </div>
  );
}
