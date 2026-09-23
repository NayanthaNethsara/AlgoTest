"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, EyeIcon, FileTextIcon, Loader2, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { downloadTextFile } from "@/lib/file-utils";
import { formatByteSize, formatHeadTailPreview } from "@/lib/testcase-utils";
import type { InspectModalState } from "./types";

interface TestContentInspectorDialogProps {
  state: InspectModalState;
  onClose: () => void;
  onCopy: () => void;
}

export function TestContentInspectorDialog({
  state,
  onClose,
  onCopy,
}: TestContentInspectorDialogProps) {
  const [viewMode, setViewMode] = useState<"preview" | "full">("preview");

  const preview = useMemo(() => {
    return formatHeadTailPreview(state.content, 25, 25);
  }, [state.content]);

  const byteSize = preview.totalBytes;
  const isLarge = preview.isTruncated;
  const activeMode = isLarge ? viewMode : "full";

  function handleDownloadFile() {
    const extension = state.field === "input" ? "in" : "out";
    const filename = `case_${state.ordinal}.${extension}`;
    downloadTextFile(filename, state.content);
    toast.success(`Downloaded ${filename}`);
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <FileTextIcon className="size-4 text-primary" />
              <span>{state.title}</span>
            </DialogTitle>
            {!state.loading && !state.error && (
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <Badge variant="outline" className="text-[11px] font-mono">
                  {preview.totalLines.toLocaleString()} line{preview.totalLines === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline" className="text-[11px] font-mono">
                  {formatByteSize(byteSize)}
                </Badge>
              </div>
            )}
          </div>
        </DialogHeader>

        {isLarge && !state.loading && !state.error && (
          <div className="flex items-center justify-between border-b pb-2 pt-1 text-xs">
            <span className="text-muted-foreground">
              {activeMode === "preview"
                ? `Showing start (first ${preview.headLinesCount} lines) and end (last ${preview.tailLinesCount} lines)`
                : `Showing all ${preview.totalLines.toLocaleString()} lines`}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={activeMode === "preview" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setViewMode("preview")}
                className="h-6 text-[11px] gap-1"
              >
                <SparklesIcon className="size-3" /> Head & Tail Preview
              </Button>
              <Button
                type="button"
                variant={activeMode === "full" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setViewMode("full")}
                className="h-6 text-[11px] gap-1"
              >
                <EyeIcon className="size-3" /> Full Text
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden py-2">
          {state.loading ? (
            <div className="h-64 flex items-center justify-center text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading content from database...
            </div>
          ) : state.error ? (
            <div className="p-4 rounded bg-destructive/10 text-destructive text-xs">
              {state.error}
            </div>
          ) : activeMode === "preview" && isLarge ? (
            <div className="flex flex-col h-[52vh] rounded-md border bg-muted/20 font-mono text-xs overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
                <div className="text-[11px] font-semibold text-muted-foreground pb-1 uppercase tracking-wider">
                  Start (lines 1 to {preview.headLinesCount})
                </div>
                <pre className="text-foreground/90 whitespace-pre-wrap leading-relaxed select-text">
                  {preview.headText}
                </pre>
              </div>

              <div className="flex items-center justify-between border-y border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-xs">
                <span className="font-semibold text-primary">
                  ··· [Truncated {preview.omittedLines.toLocaleString()} lines] ···
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setViewMode("full")}
                  className="h-6 text-[11px]"
                >
                  View full content
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
                <div className="text-[11px] font-semibold text-muted-foreground pb-1 uppercase tracking-wider">
                  End (last {preview.tailLinesCount} lines)
                </div>
                <pre className="text-foreground/90 whitespace-pre-wrap leading-relaxed select-text">
                  {preview.tailText}
                </pre>
              </div>
            </div>
          ) : (
            <Textarea
              readOnly
              value={state.content}
              className="font-mono text-xs leading-relaxed h-[52vh] resize-none overflow-y-auto w-full select-all"
            />
          )}
        </div>

        <DialogFooter className="flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            {!state.loading && !state.error && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadFile}
                className="gap-1.5 text-xs"
              >
                <DownloadIcon className="size-3.5" /> Download file
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {!state.loading && !state.error && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(state.content);
                  onCopy();
                }}
              >
                Copy All Text
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

