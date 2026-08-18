import { useState } from "react";
import { Users } from "lucide-react";
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

interface UserTeamDialogProps {
  user: User | null;
  teams: Team[];
  pending: boolean;
  onSave: (userId: string, targetTeamId: string) => Promise<void>;
  onClose: () => void;
}

export function UserTeamDialog({
  user,
  teams,
  pending,
  onSave,
  onClose,
}: UserTeamDialogProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(user?.teamId ?? "");

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    await onSave(user.id, selectedTeamId);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-semibold">Assign Team</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Assign <strong className="text-foreground">{user.displayName || user.username}</strong>{" "}
            to a team. Competitors must belong to exactly one team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Select Team *</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-xs"
              required
            >
              <option value="">-- Choose Team --</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !selectedTeamId} className="text-xs">
              {pending ? "Saving..." : "Save Assignment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
