import { Edit2, Trash2, UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import type { Team } from "@/types/team";
import type { User } from "@/types/user";

interface TeamTableProps {
  teams: Team[];
  pending: boolean;
  onEditTeam: (team: Team) => void;
  onDeleteTeam: (team: Team) => void;
  onAddMember: (team: Team) => void;
  onRemoveMember: (team: Team, user: User) => void;
}

export function TeamTable({
  teams,
  pending,
  onEditTeam,
  onDeleteTeam,
  onAddMember,
  onRemoveMember,
}: TeamTableProps) {
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team Name</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="p-8 text-center text-xs text-muted-foreground">
                No teams found matching search.
              </TableCell>
            </TableRow>
          ) : (
            teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="font-medium text-xs text-foreground">{t.name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {t.members?.length || 0} member(s)
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {t.members && t.members.length > 0 ? (
                      t.members.map((m) => (
                        <div
                          key={m.id}
                          className="group flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
                        >
                          <span className="font-medium">{m.displayName || m.username}</span>
                          <button
                            type="button"
                            onClick={() => onRemoveMember(t, m)}
                            disabled={pending}
                            title="Remove from team"
                            className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                          >
                            <UserMinus className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No members yet</span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onAddMember(t)}
                      disabled={pending}
                      title="Add Competitor to Team"
                      className="h-8 w-8 text-foreground"
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditTeam(t)}
                      disabled={pending}
                      title="Rename Team"
                      className="h-8 w-8 text-foreground"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteTeam(t)}
                      disabled={pending}
                      title="Delete Team"
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
  );
}
