import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

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
    <Card className="p-4 border-border shadow-sm">
      <div className="flex items-center justify-between mb-3 border-b pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Create New Team
        </h3>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={pending || !name.trim()}
            className="text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {pending ? "Creating..." : "Create Team"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
