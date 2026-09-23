"use client";

import { useEffect, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  FolderUp,
  Loader2,
  CheckCircle2,
  RotateCcw,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MAX_SANDBOX_OUTPUT_BYTES,
  MAX_SINGLE_TEST_FILE_BYTES,
  downloadSampleTestCaseFiles,
  formatByteSize,
  readFileHeadTail,
} from "@/lib/testcase-utils";
import type { BatchQueueItem } from "./types";

interface BatchUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: BatchQueueItem[];
  notice: string | null;
  isRunning: boolean;
  onStartBatch: (selectedIds: Set<string>) => void;
  onRetryItem: (index: number) => void;
  onRemoveItem?: (index: number) => void;
}

function BatchItemPreview({ item }: { item: BatchQueueItem }) {
  const [data, setData] = useState<{
    inHead: string;
    inTail: string;
    inTrunc: boolean;
    expHead: string;
    expTail: string;
    expTrunc: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [inputData, expData] = await Promise.all([
        readFileHeadTail(item.inputFile, 1024, 1024),
        readFileHeadTail(item.expectedFile, 1024, 1024),
      ]);
      if (active) {
        setData({
          inHead: inputData.headText,
          inTail: inputData.tailText,
          inTrunc: inputData.isTruncated,
          expHead: expData.headText,
          expTail: expData.tailText,
          expTrunc: expData.isTruncated,
        });
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [item]);

  if (loading) {
    return (
      <div className="py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="size-3 animate-spin" /> Loading preview...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 text-[11px] font-mono">
      <div className="rounded border bg-muted/30 p-2 space-y-1">
        <span className="text-muted-foreground font-semibold block text-[10px] uppercase">
          stdin ({formatByteSize(item.inputFile.size)})
        </span>
        <pre className="whitespace-pre-wrap max-h-28 overflow-y-auto text-foreground/90 select-text leading-relaxed">
          {data.inHead}
          {data.inTrunc && "\n··· [Truncated] ···\n" + data.inTail}
        </pre>
      </div>
      <div className="rounded border bg-muted/30 p-2 space-y-1">
        <span className="text-muted-foreground font-semibold block text-[10px] uppercase">
          stdout ({formatByteSize(item.expectedFile.size)})
        </span>
        <pre className="whitespace-pre-wrap max-h-28 overflow-y-auto text-foreground/90 select-text leading-relaxed">
          {data.expHead}
          {data.expTrunc && "\n··· [Truncated] ···\n" + data.expTail}
        </pre>
      </div>
    </div>
  );
}

export function BatchUploadDialog({
  open,
  onOpenChange,
  queue,
  notice,
  isRunning,
  onStartBatch,
  onRetryItem,
  onRemoveItem,
}: BatchUploadDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);

  // Initialize selected items whenever queue changes, excluding oversized files
  useEffect(() => {
    const validIds = queue
      .filter(
        (q) =>
          q.inputFile.size <= MAX_SINGLE_TEST_FILE_BYTES &&
          q.expectedFile.size <= MAX_SINGLE_TEST_FILE_BYTES
      )
      .map((q) => q.id);
    setSelectedIds(new Set(validIds));
  }, [queue]);

  const successCount = queue.filter((q) => q.status === "success").length;
  const pendingQueue = queue.filter((q) => q.status !== "success");
  const selectedPendingCount = pendingQueue.filter((q) => selectedIds.has(q.id)).length;
  const totalQueueBytes = queue.reduce((acc, q) => acc + q.totalSize, 0);
  const selectedPendingBytes = pendingQueue
    .filter((q) => selectedIds.has(q.id))
    .reduce((acc, q) => acc + q.totalSize, 0);

  const isAllPendingSelected =
    pendingQueue.length > 0 &&
    pendingQueue
      .filter(
        (q) =>
          q.inputFile.size <= MAX_SINGLE_TEST_FILE_BYTES &&
          q.expectedFile.size <= MAX_SINGLE_TEST_FILE_BYTES
      )
      .every((q) => selectedIds.has(q.id));

  function toggleSelectAll() {
    if (isAllPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queue.map((q) => q.id)));
    }
  }

  function toggleItemSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDownloadSample() {
    downloadSampleTestCaseFiles();
    toast.success("Downloaded sample test case files (01.in and 01.out)");
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isRunning && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <FolderUp className="h-4 w-4 text-primary" />
              <span>Batch Test Case Uploader</span>
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleDownloadSample}
              className="gap-1 text-[11px]"
            >
              <DownloadIcon className="size-3" /> Download sample pair
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Files are queued and uploaded sequentially part-by-part to support test suites totaling 200+ MB. Max 20 MB per file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-3">
          <div className="rounded border bg-muted/20 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="text-muted-foreground">
              <strong className="text-foreground font-medium">Sequential Batching:</strong> Files upload one-by-one, safely accommodating large datasets without exceeding HTTP body limits.
            </div>
            <div className="font-mono text-[11px] text-muted-foreground shrink-0">
              Total volume: {formatByteSize(totalQueueBytes)}
            </div>
          </div>

          {notice && (
            <div className="rounded border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary font-medium">
              {notice}
            </div>
          )}

          {queue.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No files selected. Drop or select matching .in and .out files to queue them.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isAllPendingSelected}
                    onChange={toggleSelectAll}
                    disabled={isRunning || pendingQueue.length === 0}
                    aria-label="Select all queued pairs"
                    className="accent-primary"
                  />
                  <span>Queue ({queue.length} test case pairs)</span>
                </div>
                <span>
                  Uploaded: {successCount} / {queue.length}
                </span>
              </div>

              {queue.map((item, idx) => {
                const isInputOversized = item.inputFile.size > MAX_SINGLE_TEST_FILE_BYTES;
                const isExpectedOversized = item.expectedFile.size > MAX_SINGLE_TEST_FILE_BYTES;
                const isOversized = isInputOversized || isExpectedOversized;
                const isExpectedLarge = item.expectedFile.size > MAX_SANDBOX_OUTPUT_BYTES;
                const isSelected = selectedIds.has(item.id);
                const isExpanded = expandedPreviewId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`rounded border p-2.5 flex flex-col gap-2 text-xs transition-colors ${
                      item.status === "success"
                        ? "border-success/40 bg-success/5"
                        : item.status === "error" || isOversized
                          ? "border-destructive/40 bg-destructive/5"
                          : item.status === "uploading"
                            ? "border-primary/50 bg-primary/5"
                            : isSelected
                              ? "border-primary/30 bg-primary/5"
                              : "border-border bg-muted/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {item.status !== "success" && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isRunning || item.status === "uploading" || isOversized}
                            onChange={() => toggleItemSelection(item.id)}
                            aria-label={`Select case ${idx + 1}`}
                            className="accent-primary"
                          />
                        )}
                        <span className="font-mono font-bold text-muted-foreground w-6 shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                            <span className="truncate">{item.inputFile.name} + {item.expectedFile.name}</span>
                            {isExpectedLarge && !isOversized && (
                              <Badge variant="outline" className="text-[9px] text-warning border-warning/40 shrink-0">
                                Output &gt; 4 MB
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            Size: {formatByteSize(item.totalSize)}
                          </div>
                          {isOversized ? (
                            <div className="text-[11px] text-destructive font-medium mt-0.5">
                              Exceeds 20 MB file limit ({isInputOversized ? `stdin: ${formatByteSize(item.inputFile.size)}` : `stdout: ${formatByteSize(item.expectedFile.size)}`})
                            </div>
                          ) : item.error ? (
                            <div className="text-[11px] text-destructive font-medium mt-0.5">
                              {item.error}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setExpandedPreviewId(isExpanded ? null : item.id)
                          }
                          className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUpIcon className="size-3" /> Hide
                            </>
                          ) : (
                            <>
                              <ChevronDownIcon className="size-3" /> Preview
                            </>
                          )}
                        </Button>

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

                        {!isRunning && item.status !== "uploading" && onRemoveItem && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onRemoveItem(idx)}
                            aria-label={`Remove test case ${idx + 1}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {isExpanded && <BatchItemPreview item={item} />}
                  </div>
                );
              })}
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
          {pendingQueue.length > 0 && (
            <Button
              type="button"
              size="sm"
              disabled={isRunning || selectedPendingCount === 0}
              onClick={() => onStartBatch(selectedIds)}
              className="gap-1.5"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading Part-by-Part...
                </>
              ) : (
                `Start Batch Upload (${selectedPendingCount} pairs · ${formatByteSize(selectedPendingBytes)})`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

