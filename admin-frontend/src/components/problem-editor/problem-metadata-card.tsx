import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import type { Difficulty } from "@/types/problem";
import { MIN_EVALUATION_TEST_CASES } from "@/lib/testcase-utils";

interface ProblemMetadataCardProps {
  slug: string;
  title: string;
  difficulty: Difficulty;
  maxScore: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  published: boolean;
  isEditing: boolean;
  testsCount: number;
  onTitleChange: (title: string) => void;
  onSlugChange: (slug: string) => void;
  onDifficultyChange: (diff: Difficulty) => void;
  onMaxScoreChange: (score: number) => void;
  onTimeLimitChange: (limit: number) => void;
  onMemoryLimitChange: (limit: number) => void;
  onPublishedChange: (pub: boolean) => void;
}

export function ProblemMetadataCard({
  slug,
  title,
  difficulty,
  maxScore,
  timeLimitMs,
  memoryLimitMb,
  published,
  isEditing,
  testsCount,
  onTitleChange,
  onSlugChange,
  onDifficultyChange,
  onMaxScoreChange,
  onTimeLimitChange,
  onMemoryLimitChange,
  onPublishedChange,
}: ProblemMetadataCardProps) {
  return (
    <Card className="p-5 flex flex-col gap-4 shadow-sm border border-border sticky top-20">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Problem Metadata
        </h2>
        <Badge variant="outline" className="text-[10px] font-mono">
          ID: {slug || "new"}
        </Badge>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground block">Problem Title *</label>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Range Sum Queries"
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground block">Slug *</label>
        <Input
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="e.g. range-sum"
          disabled={isEditing}
          required
          className="font-mono text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground block">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}
            className="h-9 w-full rounded-md border bg-background px-3 text-xs"
          >
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground block">Max Score</label>
          <Input
            type="number"
            value={maxScore}
            onChange={(e) => onMaxScoreChange(Number(e.target.value))}
            min={1}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground block">Time Limit (ms)</label>
          <Input
            type="number"
            value={timeLimitMs}
            onChange={(e) => onTimeLimitChange(Number(e.target.value))}
            step={500}
            min={500}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground block">
            Memory Limit (MB)
          </label>
          <Input
            type="number"
            value={memoryLimitMb}
            onChange={(e) => onMemoryLimitChange(Number(e.target.value))}
            step={64}
            min={64}
          />
        </div>
      </div>

      <div className="pt-3 border-t mt-1 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => onPublishedChange(e.target.checked)}
            className="rounded border h-4 w-4"
          />
          <span>Published to Contestants</span>
        </label>

        {published && testsCount < MIN_EVALUATION_TEST_CASES && (
          <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-[11px] font-medium text-destructive flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Cannot publish with fewer than {MIN_EVALUATION_TEST_CASES} evaluation test cases (
              {testsCount}/{MIN_EVALUATION_TEST_CASES} added).
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
