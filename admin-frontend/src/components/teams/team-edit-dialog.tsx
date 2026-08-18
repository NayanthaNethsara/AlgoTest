import { useState } from "react";
import { Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Team } from "@/types/team";

interface TeamEditDialogProps {
  team: Team | null;
  pending: boolean;
  onSave: (teamId: string, newName: string) => Promise<void>;
  onClose: () => void;
}

export function TeamEditDialog({ team, pending, onSave, onClose }: TeamEditDialogProps) {
  const [name, setName] = useState(team?.name ?? "");

  if (!team) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !name.trim()) return;
    await onSave(team.id, name.trim());
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Edit2 className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-semibold">Rename Team</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Change the display name for team <strong className="text-foreground">{team.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Team Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Warriors"
              required
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !name.trim()} className="text-xs">
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
