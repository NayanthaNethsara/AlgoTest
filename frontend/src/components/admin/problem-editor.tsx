"use client";

import { useState } from "react";
import { X, Plus, Trash2, Eye, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/common/markdown";
import type { Difficulty, ProblemDetail, ProblemInput, Sample } from "@/types/problem";

type ProblemEditorProps = {
  initialData?: ProblemDetail | null;
  onSave: (input: ProblemInput) => Promise<void>;
  onClose: () => void;
  pending: boolean;
};

export function ProblemEditor({ initialData, onSave, onClose, pending }: ProblemEditorProps) {
  const isEditing = Boolean(initialData);

  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [difficulty, setDifficulty] = useState(initialData?.difficulty ?? "Easy");
  const [maxScore, setMaxScore] = useState(initialData?.maxScore ?? 100);
  const [timeLimitMs, setTimeLimitMs] = useState(initialData?.timeLimitMs ?? 4000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(initialData?.memoryLimitMb ?? 256);
  const [published, setPublished] = useState(initialData?.published ?? false);
  const [statement, setStatement] = useState(initialData?.statement ?? "");
  const [constraints, setConstraints] = useState(initialData?.constraints ?? "");
  const [samples, setSamples] = useState<Sample[]>(
    initialData?.samples ?? [{ ordinal: 1, input: "", output: "", explanation: "" }]
  );

  const [previewTab, setPreviewTab] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState<string | null>(null);

  function handleAddSample() {
    setSamples((prev) => [
      ...prev,
      { ordinal: prev.length + 1, input: "", output: "", explanation: "" },
    ]);
  }

  function handleRemoveSample(index: number) {
    setSamples((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSampleChange(index: number, field: keyof Sample, value: string) {
    setSamples((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!slug.trim() || !title.trim() || !statement.trim()) {
      setError("Slug, Title, and Statement are required.");
      return;
    }

    try {
      await onSave({
        slug: slug.trim(),
        title: title.trim(),
        difficulty,
        maxScore: Number(maxScore),
        timeLimitMs: Number(timeLimitMs),
        memoryLimitMb: Number(memoryLimitMb),
        published,
        statement,
        constraints,
        samples: samples.map((s, idx) => ({
          ordinal: idx + 1,
          input: s.input,
          output: s.output,
          explanation: s.explanation || undefined,
        })),
      });
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to save problem.");
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-xl border bg-card text-card-foreground shadow-2xl my-8">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? `Edit Problem: ${initialData?.title}` : "Create New Problem"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Slug</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. range-sum"
                disabled={isEditing}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Range Sum Queries"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Points</label>
              <Input
                type="number"
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
                min={1}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Time Limit (ms)</label>
              <Input
                type="number"
                value={timeLimitMs}
                onChange={(e) => setTimeLimitMs(Number(e.target.value))}
                step={500}
                min={500}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Memory Limit (MB)</label>
              <Input
                type="number"
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                step={64}
                min={64}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="rounded border"
                />
                Published
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">
                Problem Statement (Markdown)
              </label>
              <div className="flex border rounded-md overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewTab("edit")}
                  className={`flex items-center gap-1 px-3 py-1 ${
                    previewTab === "edit" ? "bg-primary text-primary-foreground font-medium" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Edit3 className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("preview")}
                  className={`flex items-center gap-1 px-3 py-1 ${
                    previewTab === "preview" ? "bg-primary text-primary-foreground font-medium" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Eye className="h-3 w-3" /> Preview
                </button>
              </div>
            </div>

            {previewTab === "edit" ? (
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={8}
                placeholder="Write the problem statement in Markdown..."
                className="w-full rounded-md border bg-background p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                required
              />
            ) : (
              <div className="min-h-[200px] max-h-[400px] overflow-y-auto rounded-md border bg-muted/20 p-4">
                <Markdown>{statement || "*No statement provided.*"}</Markdown>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Constraints (Markdown, optional)
            </label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={3}
              placeholder="- $1 \le N \le 10^5$"
              className="w-full rounded-md border bg-background p-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">Sample Test Cases</label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddSample}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Sample
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              {samples.map((s, idx) => (
                <div key={idx} className="rounded-lg border p-4 bg-muted/10 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Sample #{idx + 1}
                    </span>
                    {samples.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveSample(idx)}
                        className="h-6 w-6 text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Input</label>
                      <textarea
                        value={s.input}
                        onChange={(e) => handleSampleChange(idx, "input", e.target.value)}
                        rows={3}
                        className="w-full rounded-md border bg-background p-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Output</label>
                      <textarea
                        value={s.output}
                        onChange={(e) => handleSampleChange(idx, "output", e.target.value)}
                        rows={3}
                        className="w-full rounded-md border bg-background p-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : isEditing ? "Update Problem" : "Create Problem"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
