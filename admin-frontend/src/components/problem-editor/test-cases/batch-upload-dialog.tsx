"use client";

import { FolderUp, Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatByteSize } from "@/lib/testcase-utils";
import type { BatchQueueItem } from "./types";

interface BatchUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: BatchQueueItem[];
  notice: string | null;
  isRunning: boolean;
  onStartBatch: () => void;
  onRetryItem: (index: number) => void;
}

export function BatchUploadDialog({
  open,
  onOpenChange,
  queue,
  notice,
  isRunning,
  onStartBatch,
  onRetryItem,
}: BatchUploadDialogProps) {
  const successCount = queue.filter((q) => q.status === "success").length;
  const hasPendingItems = queue.some((q) => q.status !== "success");

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isRunning && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <FolderUp className="h-4 w-4 text-primary" />
            <span>Sequential Batch Uploader (Part-by-Part)</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-3">
          {notice && (
            <div className="rounded border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary font-medium">
              {notice}
            </div>
          )}

          {queue.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No files selected. Click &quot;Upload Part-by-Part (Batch)&quot; to pick matching test
              case files.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b">
                <span>Queue ({queue.length} test case pairs)</span>
                <span>
                  Uploaded: {successCount} / {queue.length}
                </span>
              </div>

              {queue.map((item, idx) => (
                <div
                  key={item.id}
                  className={`rounded border p-2.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                    item.status === "success"
                      ? "border-success/40 bg-success/5"
                      : item.status === "error"
                        ? "border-destructive/40 bg-destructive/5"
                        : item.status === "uploading"
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-muted/10"
                  }`}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="font-mono font-bold text-muted-foreground w-6 shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {item.inputFile.name} + {item.expectedFile.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        Size: {formatByteSize(item.totalSize)}
                      </div>
                      {item.error && (
                        <div className="text-[11px] text-destructive font-medium mt-0.5">
                          {item.error}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "uploading" && (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span className="font-mono text-[11px]">{item.progress}%</span>
                      </div>
                    )}

                    {item.status === "success" && (
                      <div className="flex items-center gap-1 text-success font-medium text-[11px]">
                        <CheckCircle2 className="h-4 w-4" /> Uploaded
                      </div>
                    )}

                    {item.status === "error" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isRunning}
                        onClick={() => onRetryItem(idx)}
                        className="h-6 px-2 text-[10px] gap-1 text-destructive border-destructive/30"
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </Button>
                    )}

                    {item.status === "queued" && (
                      <Badge variant="outline" className="text-[10px]">
                        Queued
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRunning}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {hasPendingItems && (
            <Button
              type="button"
              size="sm"
              disabled={isRunning || queue.length === 0}
              onClick={onStartBatch}
              className="gap-1.5"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading Part-by-Part...
                </>
              ) : (
                "Start Batch Upload"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
