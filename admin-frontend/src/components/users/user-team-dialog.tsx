"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Spinner } from "@/components/ui/spinner";
import type { Team } from "@/types/team";
import type { User } from "@/types/user";

interface UserTeamDialogProps {
  user: User | null;
  teams: Team[];
  pending: boolean;
  onSave: (userId: string, targetTeamId: string) => Promise<void>;
  onClose: () => void;
}

export function UserTeamDialog({ user, teams, pending, onSave, onClose }: UserTeamDialogProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(user?.teamId ?? "");

  if (!user) return null;

  const options = teams.map((t) => ({ value: t.id, label: t.name }));
  const unchanged = selectedTeamId === (user.teamId ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedTeamId) return;
    await onSave(user.id, selectedTeamId);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign team</DialogTitle>
          <DialogDescription>
            Move <strong className="text-foreground">{user.displayName || user.username}</strong> to
            another team. Competitors belong to exactly one team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="assign-team">Team</FieldLabel>
            <SimpleSelect
              id="assign-team"
              value={selectedTeamId}
              onValueChange={setSelectedTeamId}
              options={options}
              placeholder="Choose a team…"
              className="text-xs"
            />
            <FieldDescription>
              {user.teamName
                ? `Currently in ${user.teamName}. Moving removes them from that team first.`
                : "This competitor has no team yet."}
            </FieldDescription>
          </Field>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !selectedTeamId || unchanged}
              className="gap-1.5"
            >
              {pending && <Spinner />}
              {pending ? "Saving…" : "Save assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
