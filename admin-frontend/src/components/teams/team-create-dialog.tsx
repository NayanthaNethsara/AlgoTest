"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
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

interface TeamCreateDialogProps {
  pending: boolean;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function TeamCreateDialog({ pending, onSubmit, onCancel }: TeamCreateDialogProps) {
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit(name.trim());
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>
            Teams hold the competitors whose submissions share a leaderboard entry.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="team-name">Team name</FieldLabel>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Code Warriors"
              required
              autoFocus
              className="text-xs"
            />
          </Field>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !name.trim()} className="gap-1.5">
              {pending ? <Spinner /> : <PlusIcon />}
              {pending ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
