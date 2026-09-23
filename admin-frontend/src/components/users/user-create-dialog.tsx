"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Team } from "@/types/team";
import type { CreateUserInput } from "@/types/user";

type TeamMode = "existing" | "new";

interface UserCreateDialogProps {
  teams: Team[];
  pending: boolean;
  onSubmit: (payload: CreateUserInput) => Promise<void>;
  onCancel: () => void;
}

export function UserCreateDialog({ teams, pending, onSubmit, onCancel }: UserCreateDialogProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [teamMode, setTeamMode] = useState<TeamMode>(teams.length > 0 ? "existing" : "new");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const teamOptions = teams.map((t) => ({ value: t.id, label: t.name }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (!username.trim()) {
      setValidationError("A username is required.");
      return;
    }
    if (teamMode === "existing" && !selectedTeamId) {
      setValidationError("Select an existing team for this competitor.");
      return;
    }
    if (teamMode === "new" && !newTeamName.trim()) {
      setValidationError("Enter a name for the new team.");
      return;
    }

    await onSubmit({
      username: username.trim(),
      displayName: displayName.trim() || undefined,
      password: password.trim() || undefined,
      teamId: teamMode === "existing" ? selectedTeamId : undefined,
      teamName: teamMode === "new" ? newTeamName.trim() : undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add competitor</DialogTitle>
          <DialogDescription>
            Every competitor belongs to exactly one team — pick an existing one or create it here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            {validationError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="new-username">Username</FieldLabel>
                <Input
                  id="new-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="jdoe"
                  required
                  autoFocus
                  autoCapitalize="none"
                  spellCheck={false}
                  className="text-xs"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="new-display-name">Display name</FieldLabel>
                <Input
                  id="new-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Doe"
                  className="text-xs"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Team</FieldLabel>
              <Tabs value={teamMode} onValueChange={(v) => setTeamMode(v as TeamMode)}>
                <TabsList className="h-8 w-full">
                  <TabsTrigger
                    value="existing"
                    disabled={teams.length === 0}
                    className="h-7 flex-1 text-xs"
                  >
                    Existing team
                  </TabsTrigger>
                  <TabsTrigger value="new" className="h-7 flex-1 text-xs">
                    New team
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {teamMode === "existing" ? (
                <SimpleSelect
                  value={selectedTeamId}
                  onValueChange={setSelectedTeamId}
                  options={teamOptions}
                  placeholder="Choose a team…"
                  aria-label="Existing team"
                  className="text-xs"
                />
              ) : (
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Code Warriors"
                  aria-label="New team name"
                  className="text-xs"
                />
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="new-password">Password</FieldLabel>
              <Input
                id="new-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty to auto-generate"
                autoComplete="off"
                className="font-mono text-xs"
              />
              <FieldDescription>
                A generated password is shown once after creation.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
              {pending ? <Spinner /> : <PlusIcon />}
              {pending ? "Creating…" : "Create competitor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
