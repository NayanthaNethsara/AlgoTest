"use client";

import { DownloadIcon, Maximize2Icon, ReplaceIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatByteSize } from "@/lib/testcase-utils";
import type { TestCaseMetadata } from "@/types/problem";

interface TestCaseItemProps {
  test: TestCaseMetadata;
  points: number;
  onPointChange: (ordinal: number, points: number) => void;
  onInspect: (ordinal: number, field: "input" | "expected") => void;
  onDownload: (ordinal: number, field: "input" | "expected") => void;
  onReplace: (test: TestCaseMetadata) => void;
  onDelete: (ordinal: number) => void;
}

function Snippet({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 truncate">
      <span className="text-muted-foreground select-none">{label}: </span>
      <span className="text-foreground/90">{value ? value.replace(/\n/g, " ↵ ") : "(empty)"}</span>
    </div>
  );
}

export function TestCaseItem({
  test,
  points,
  onPointChange,
  onInspect,
  onDownload,
  onReplace,
  onDelete,
}: TestCaseItemProps) {
  const pointsId = `test-points-${test.ordinal}`;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-3 transition-colors hover:border-foreground/20">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold tracking-wider uppercase">Case #{test.ordinal}</span>

          <Badge variant="outline" className="font-mono text-[10px]">
            in {formatByteSize(test.inputSize)} · out {formatByteSize(test.expectedSize)}
          </Badge>

          <span className="flex items-center gap-1.5">
            <label htmlFor={pointsId} className="text-[11px] text-muted-foreground">
              Points
            </label>
            <Input
              id={pointsId}
              type="number"
              inputMode="numeric"
              min={0}
              value={points}
              onChange={(e) => onPointChange(test.ordinal, Number(e.target.value))}
              className="h-6 w-16 p-1 text-center font-mono text-[11px]"
            />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onInspect(test.ordinal, "input")}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <Maximize2Icon /> Input
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onInspect(test.ordinal, "expected")}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <Maximize2Icon /> Expected
          </Button>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onDownload(test.ordinal, "input")}
                  aria-label={`Download input for case ${test.ordinal}`}
                  className="text-muted-foreground hover:text-foreground"
                />
              }
            >
              <DownloadIcon />
            </TooltipTrigger>
            <TooltipContent>Download input file</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onReplace(test)}
                  aria-label={`Replace case ${test.ordinal}`}
                  className="text-primary hover:bg-primary/10"
                />
              }
            >
              <ReplaceIcon />
            </TooltipTrigger>
            <TooltipContent>Replace this test case</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onDelete(test.ordinal)}
                  aria-label={`Delete case ${test.ordinal}`}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                />
              }
            >
              <Trash2Icon />
            </TooltipTrigger>
            <TooltipContent>Delete test case</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid gap-2 rounded-md border bg-muted/20 p-2 font-mono text-[11px] md:grid-cols-2">
        <Snippet label="stdin" value={test.inputSnippet} />
        <Snippet label="stdout" value={test.expectedSnippet} />
      </div>
    </div>
  );
}
