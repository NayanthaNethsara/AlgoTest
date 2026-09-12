"use client";

import { Maximize2, Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { TestCaseMetadata } from "@/types/problem";
import { formatByteSize } from "@/lib/testcase-utils";

interface TestCaseItemProps {
  test: TestCaseMetadata;
  points: number;
  onPointChange: (ordinal: number, points: number) => void;
  onInspect: (ordinal: number, field: "input" | "expected") => void;
  onDownload: (ordinal: number, field: "input" | "expected") => void;
  onReplace: (test: TestCaseMetadata) => void;
  onDelete: (ordinal: number) => void;
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
  return (
    <div className="rounded-lg border border-border bg-card p-3.5 flex flex-col gap-2.5 transition-all hover:border-border/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            Case #{test.ordinal}
          </span>

          <Badge variant="outline" className="text-[10px] font-mono">
            In: {formatByteSize(test.inputSize)} • Out: {formatByteSize(test.expectedSize)}
          </Badge>

          <div className="flex items-center gap-1">
            <label className="text-[11px] text-muted-foreground">Points:</label>
            <Input
              type="number"
              min={0}
              value={points}
              onChange={(e) => onPointChange(test.ordinal, Number(e.target.value))}
              className="h-6 w-16 text-[11px] font-mono text-center p-1"
            />
          </div>
        </div>

        {/* Actions for this test case */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onInspect(test.ordinal, "input")}
            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            title="Inspect full input data"
          >
            <Maximize2 className="h-3 w-3" /> Input
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onInspect(test.ordinal, "expected")}
            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            title="Inspect full expected output data"
          >
            <Maximize2 className="h-3 w-3" /> Expected
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDownload(test.ordinal, "input")}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Download input file"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onReplace(test)}
            className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10"
            title="Replace or edit this test case"
          >
            Replace
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(test.ordinal)}
            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
            title="Delete test case"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Preview snippets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono bg-muted/20 rounded p-2 border border-border/40">
        <div className="truncate">
          <span className="text-muted-foreground select-none">stdin: </span>
          <span className="text-foreground/90">
            {test.inputSnippet ? test.inputSnippet.replace(/\n/g, " ↵ ") : "(empty)"}
          </span>
        </div>
        <div className="truncate">
          <span className="text-muted-foreground select-none">stdout: </span>
          <span className="text-foreground/90">
            {test.expectedSnippet ? test.expectedSnippet.replace(/\n/g, " ↵ ") : "(empty)"}
          </span>
        </div>
      </div>
    </div>
  );
}
