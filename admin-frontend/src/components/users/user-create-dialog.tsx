import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { Team } from "@/types/team";
import type { CreateUserInput } from "@/types/user";

interface UserCreateDialogProps {
  teams: Team[];
  pending: boolean;
  onSubmit: (payload: CreateUserInput) => Promise<void>;
  onCancel: () => void;
}

export function UserCreateDialog({
  teams,
  pending,
  onSubmit,
  onCancel,
}: UserCreateDialogProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [teamSelectionMode, setTeamSelectionMode] = useState<"existing" | "new">("existing");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (teamSelectionMode === "existing" && !selectedTeamId) {
      setValidationError("Please select an existing team for this competitor.");
      return;
    }
    if (teamSelectionMode === "new" && !newTeamName.trim()) {
      setValidationError("Please enter a new team name for this competitor.");
      return;
    }

    await onSubmit({
      username: username.trim(),
      displayName: displayName.trim() || undefined,
      password: password.trim() || undefined,
      teamId: teamSelectionMode === "existing" ? selectedTeamId : undefined,
      teamName: teamSelectionMode === "new" ? newTeamName.trim() : undefined,
    });
  }

  return (
    <Card className="p-5 border-border shadow-sm">
      <div className="flex items-center justify-between mb-4 border-b pb-3">
        <div>
          <h3 className="text-sm font-semibold">Add New Competitor</h3>
          <p className="text-xs text-muted-foreground">
            Competitors must be assigned to a team (either an existing team or a newly created one).
          </p>
        </div>
      </div>

      {validationError && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {validationError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Username *</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. jdoe"
              required
              className="text-xs"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Display Name (Optional)
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="text-xs"
            />
          </div>
        </div>

        {/* Team Assignment Segment */}
        <div className="rounded-lg border bg-muted/10 p-4 space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-foreground block">
            Team Assignment *
          </label>

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="teamMode"
                checked={teamSelectionMode === "existing"}
                onChange={() => setTeamSelectionMode("existing")}
              />
              Select Existing Team
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="teamMode"
                checked={teamSelectionMode === "new"}
                onChange={() => setTeamSelectionMode("new")}
              />
              Create New Team
            </label>
          </div>

          {teamSelectionMode === "existing" ? (
            <div className="flex flex-col gap-1">
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                required
                className="h-9 w-full rounded-md border bg-background px-3 text-xs"
              >
                <option value="">-- Choose Team --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="New team name..."
                required
                className="text-xs"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Custom Password (Optional)
          </label>
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave empty to auto-generate secure password"
            className="text-xs font-mono"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> {pending ? "Creating..." : "Create Competitor"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
