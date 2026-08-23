import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import type { Sample } from "@/types/problem";

interface SamplesTabProps {
  samples: Sample[];
  onAddSample: () => void;
  onRemoveSample: (index: number) => void;
  onSampleChange: (index: number, field: keyof Sample, value: string) => void;
}

export function SamplesTab({
  samples,
  onAddSample,
  onRemoveSample,
  onSampleChange,
}: SamplesTabProps) {
  return (
    <Card className="p-5 flex flex-col gap-4 shadow-sm border border-border">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Public Sample Cases
          </h2>
          <p className="text-xs text-muted-foreground">
            Displayed in the problem statement for competitors. These are <strong>not</strong> used
            as hidden evaluation cases.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onAddSample} className="h-8 text-xs gap-1">
          <Plus className="h-3.5 w-3.5" /> Add Sample Case
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {samples.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            No public sample cases added.
          </p>
        ) : (
          samples.map((s, idx) => (
            <div key={idx} className="rounded-lg border p-4 bg-muted/10 relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sample #{idx + 1}
                </span>
                {samples.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveSample(idx)}
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    Standard Input (stdin)
                  </label>
                  <Textarea
                    value={s.input}
                    onChange={(e) => onSampleChange(idx, "input", e.target.value)}
                    rows={3}
                    placeholder="e.g. 5&#10;1 2 3 4 5"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    Standard Output (stdout)
                  </label>
                  <Textarea
                    value={s.output}
                    onChange={(e) => onSampleChange(idx, "output", e.target.value)}
                    rows={3}
                    placeholder="e.g. 15"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">
                  Explanation (Optional)
                </label>
                <Input
                  value={s.explanation || ""}
                  onChange={(e) => onSampleChange(idx, "explanation", e.target.value)}
                  placeholder="e.g. Sum of elements is 1 + 2 + 3 + 4 + 5 = 15"
                  className="text-xs"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
