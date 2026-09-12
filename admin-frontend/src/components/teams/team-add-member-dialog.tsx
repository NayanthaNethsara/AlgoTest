"use client";

import { useState } from "react";
import { UserPlusIcon } from "lucide-react";
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
  const [selectedUserId, setSelectedUserId] = useState("");

  if (!team) return null;

  const noneAvailable = unassignedCompetitors.length === 0;
  const options = unassignedCompetitors.map((c) => ({
    value: c.id,
    label: c.displayName ? `${c.displayName} (${c.username})` : c.username,
  }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !selectedUserId) return;
    await onAdd(team.id, selectedUserId);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Add an unassigned competitor to <strong className="text-foreground">{team.name}</strong>
            .
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="add-member">Unassigned competitor</FieldLabel>
            <SimpleSelect
              id="add-member"
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              options={options}
              placeholder={noneAvailable ? "No unassigned competitors" : "Choose a competitor…"}
              disabled={noneAvailable}
              className="text-xs"
            />
            {noneAvailable && (
              <FieldDescription>
                Every competitor already belongs to a team. Remove one from its current team first.
              </FieldDescription>
            )}
          </Field>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !selectedUserId || noneAvailable}
              className="gap-1.5"
            >
              {pending ? <Spinner /> : <UserPlusIcon />}
              {pending ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
