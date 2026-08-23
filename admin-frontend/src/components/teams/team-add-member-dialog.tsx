import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Team } from "@/types/team";
import type { User } from "@/types/user";

interface TeamAddMemberDialogProps {
  team: Team | null;
  unassignedCompetitors: User[];
  pending: boolean;
  onAdd: (teamId: string, userId: string) => Promise<void>;
  onClose: () => void;
}

export function TeamAddMemberDialog({
  team,
  unassignedCompetitors,
  pending,
  onAdd,
  onClose,
}: TeamAddMemberDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  if (!team) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !selectedUserId) return;
    await onAdd(team.id, selectedUserId);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-semibold">Add Member</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Add an unassigned competitor to <strong className="text-foreground">{team.name}</strong>
            .
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Select Unassigned Competitor *
            </label>
            {unassignedCompetitors.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                All competitors are currently assigned to teams.
              </p>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-xs"
                required
              >
                <option value="">-- Choose Competitor --</option>
                {unassignedCompetitors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName ? `${c.displayName} (${c.username})` : c.username}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !selectedUserId || unassignedCompetitors.length === 0}
              className="text-xs"
            >
              {pending ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
