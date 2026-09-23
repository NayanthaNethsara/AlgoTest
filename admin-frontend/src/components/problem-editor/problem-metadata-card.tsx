"use client";

import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Switch } from "@/components/ui/switch";
import { MIN_EVALUATION_TEST_CASES } from "@/lib/testcase-utils";
import type { Difficulty } from "@/types/problem";

const DIFFICULTY_OPTIONS = [
  { value: "Easy", label: "Easy" },
  { value: "Medium", label: "Medium" },
  { value: "Hard", label: "Hard" },
];

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
  const blockedFromPublishing = testsCount < MIN_EVALUATION_TEST_CASES;

  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader className="border-b">
        <CardTitle className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Problem metadata
        </CardTitle>
        <Badge variant="outline" className="max-w-40 truncate font-mono text-[10px]">
          {slug || "new"}
        </Badge>
      </CardHeader>

      <CardContent>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="problem-title">Title</FieldLabel>
            <Input
              id="problem-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Range Sum Queries"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="problem-slug">Slug</FieldLabel>
            <Input
              id="problem-slug"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="range-sum"
              disabled={isEditing}
              required
              spellCheck={false}
              className="font-mono text-xs"
            />
            <FieldDescription>
              {isEditing
                ? "The slug is fixed once a problem exists — competitor links depend on it."
                : "Generated from the title until you edit it."}
            </FieldDescription>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="problem-difficulty">Difficulty</FieldLabel>
              <SimpleSelect
                id="problem-difficulty"
                value={difficulty}
                onValueChange={(v) => onDifficultyChange(v as Difficulty)}
                options={DIFFICULTY_OPTIONS}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="problem-max-score">Max score</FieldLabel>
              <Input
                id="problem-max-score"
                type="number"
                inputMode="numeric"
                value={maxScore}
                onChange={(e) => onMaxScoreChange(Number(e.target.value))}
                min={1}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="problem-time-limit">Time limit (ms)</FieldLabel>
              <Input
                id="problem-time-limit"
                type="number"
                inputMode="numeric"
                value={timeLimitMs}
                onChange={(e) => onTimeLimitChange(Number(e.target.value))}
                step={500}
                min={500}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="problem-memory-limit">Memory (MB)</FieldLabel>
              <Input
                id="problem-memory-limit"
                type="number"
                inputMode="numeric"
                value={memoryLimitMb}
                onChange={(e) => onMemoryLimitChange(Number(e.target.value))}
                step={64}
                min={64}
              />
            </Field>
          </div>

          <div className="rounded border bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Large input advisory:</span> For problems with 10–15 MB test cases, set &ge; 2500 ms and &ge; 256 MB to prevent I/O or memory overhead timeouts.
          </div>

          <Field orientation="horizontal" className="border-t pt-4">
            <FieldLabel htmlFor="problem-published" className="flex-col items-start gap-0.5">
              <FieldTitle>Published to contestants</FieldTitle>
              <FieldDescription>
                {testsCount}/{MIN_EVALUATION_TEST_CASES} evaluation tests added
              </FieldDescription>
            </FieldLabel>
            <Switch
              id="problem-published"
              checked={published}
              disabled={blockedFromPublishing && !published}
              onCheckedChange={onPublishedChange}
            />
          </Field>

          {published && blockedFromPublishing && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>
                A problem needs at least {MIN_EVALUATION_TEST_CASES} evaluation test cases before it
                can be published ({testsCount} added).
              </AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
