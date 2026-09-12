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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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

  const trimmed = name.trim();
  const unchanged = trimmed === team.name;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !trimmed || unchanged) return;
    await onSave(team.id, trimmed);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename team</DialogTitle>
          <DialogDescription>
            Change the display name for <strong className="text-foreground">{team.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="edit-team-name">Team name</FieldLabel>
            <Input
              id="edit-team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Code Warriors"
              required
              autoFocus
              className="text-xs"
            />
          </Field>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !trimmed || unchanged}
              className="gap-1.5"
            >
              {pending && <Spinner />}
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
