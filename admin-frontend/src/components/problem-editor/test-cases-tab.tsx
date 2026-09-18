"use client";

import { useRef, useState } from "react";
import {
  AlertCircleIcon,
  ArchiveIcon,
  CpuIcon,
  FolderUpIcon,
  HardDriveIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/shell/data-states";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { TestCaseMetadata } from "@/types/problem";
import {
  MIN_EVALUATION_TEST_CASES,
  calculateScoringSummary,
  generateEvenPoints,
  matchTestFilePairs,
} from "@/lib/testcase-utils";
import { getProblemTestsAction } from "@/lib/actions/problems";
import {
  deleteSingleTestCase,
  updateTestPoints,
  fetchTestCaseContent,
  downloadTestCaseFile,
  downloadTestCasesZip,
  uploadSingleTestCase,
} from "@/lib/api/test-uploader";
import { TestCaseItem } from "./test-cases/test-case-item";
import { SingleTestDialog } from "./test-cases/single-test-dialog";
import { BatchUploadDialog } from "./test-cases/batch-upload-dialog";
import { TestContentInspectorDialog } from "./test-cases/test-content-inspector-dialog";
import { ScoringSummaryBar } from "./test-cases/scoring-summary-bar";
import { TestCaseLimitsGuide } from "./test-cases/test-case-limits-guide";
import type { BatchQueueItem, InspectModalState } from "./test-cases/types";

interface TestCasesTabProps {
  problemId?: string;
  problemSlug?: string;
  tests: TestCaseMetadata[];
  maxScore: number;
  onTestsUpdated: (updatedTests: TestCaseMetadata[]) => void;
  onSaveDraftFirst?: () => void;
}

export function TestCasesTab({
  problemId,
  problemSlug = "problem",
  tests,
  maxScore,
  onTestsUpdated,
  onSaveDraftFirst,
}: TestCasesTabProps) {
  const isNewProblem = !problemId;

  // Single test modal state
  const [singleModalOpen, setSingleModalOpen] = useState(false);
  const [editTest, setEditTest] = useState<TestCaseMetadata | null>(null);

  // Inspector modal state for on-demand inspection
  const [inspectModal, setInspectModal] = useState<InspectModalState>({
    open: false,
    ordinal: 1,
    field: "input",
    title: "",
    loading: false,
    content: "",
    error: null,
  });

  // Batch Queue modal state
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
  const [batchIsRunning, setBatchIsRunning] = useState(false);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  // Points inline edit state
  const [pendingPoints, setPendingPoints] = useState<Record<number, number>>({});
  const [savingPoints, setSavingPoints] = useState(false);
  const [deleteOrdinal, setDeleteOrdinal] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const scoring = calculateScoringSummary(tests, maxScore);

  function openAddSingleModal() {
    setEditTest(null);
    setSingleModalOpen(true);
  }

  function openReplaceModal(test: TestCaseMetadata) {
    setEditTest(test);
    setSingleModalOpen(true);
  }

  function handleSingleSuccess(savedTest: TestCaseMetadata & { allTests?: TestCaseMetadata[] }, isEdit: boolean) {
    if (savedTest.allTests && savedTest.allTests.length > 0) {
      onTestsUpdated(savedTest.allTests);
    } else if (isEdit) {
      onTestsUpdated(tests.map((t) => (t.ordinal === savedTest.ordinal ? savedTest : t)));
    } else {
      onTestsUpdated([...tests, savedTest]);
    }
    toast.success(isEdit ? `Test case #${savedTest.ordinal} replaced` : `Test case #${savedTest.ordinal} added`);
  }

  async function confirmDeleteTest() {
    const ordinal = deleteOrdinal;
    setDeleteOrdinal(null);
    if (!problemId || ordinal === null) return;

    try {
      await deleteSingleTestCase(problemId, ordinal);
      try {
        const refreshed = await getProblemTestsAction(problemId);
        onTestsUpdated(refreshed);
      } catch {
        const remaining = tests
          .filter((t) => t.ordinal !== ordinal)
          .map((t) => (t.ordinal > ordinal ? { ...t, ordinal: t.ordinal - 1 } : t));
        onTestsUpdated(remaining);
      }
      toast.success(`Test case #${ordinal} deleted`, {
        description: "The remaining test cases were re-sequenced and points updated.",
      });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete the test case."));
    }
  }

  async function handleInspect(ordinal: number, field: "input" | "expected") {
    if (!problemId) return;
    setInspectModal({
      open: true,
      ordinal,
      field,
      title: `Case #${ordinal} ${field === "input" ? "Standard Input (stdin)" : "Expected Output (stdout)"}`,
      loading: true,
      content: "",
      error: null,
    });

    try {
      const text = await fetchTestCaseContent(problemId, ordinal, field);
      setInspectModal((prev) => ({
        ...prev,
        loading: false,
        content: text,
      }));
    } catch (err: unknown) {
      setInspectModal((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load content",
      }));
    }
  }

  function handleBatchFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    enqueueFiles(Array.from(e.target.files ?? []));
    if (batchFileInputRef.current) batchFileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (isNewProblem) {
      onSaveDraftFirst?.();
      return;
    }
    enqueueFiles(Array.from(e.dataTransfer.files ?? []));
  }

  function enqueueFiles(files: File[]) {
    if (files.length === 0) return;

    const { pairs, unmatched } = matchTestFilePairs(files);
    if (pairs.length === 0) {
      setBatchNotice(
        "Could not detect matching input/output pairs. Ensure pairs share a base name e.g. 01.in & 01.out or t1in.txt & t1out.txt."
      );
      setBatchModalOpen(true);
      return;
    }

    const newQueue: BatchQueueItem[] = pairs.map((p, idx) => ({
      id: `${p.baseName}_${idx}`,
      baseName: p.baseName,
      inputFile: p.inputFile,
      expectedFile: p.expectedFile,
      totalSize: p.totalSize,
      points: 0,
      status: "queued",
      progress: 0,
    }));

    let notice = `Found ${pairs.length} test case pair(s) ready to upload part-by-part.`;
    if (unmatched.length > 0) {
      notice += ` Note: ${unmatched.length} file(s) had no match: ${unmatched.slice(0, 5).join(", ")}`;
    }
    setBatchNotice(notice);
    setBatchQueue(newQueue);
    setBatchModalOpen(true);
  }

  async function runBatchUploadQueue(selectedIds?: Set<string>) {
    if (!problemId || batchIsRunning) return;
    setBatchIsRunning(true);

    let currentTests = [...tests];

    for (let i = 0; i < batchQueue.length; i++) {
      const item = batchQueue[i];
      if (item.status === "success") continue;
      if (selectedIds && !selectedIds.has(item.id)) continue;

      setBatchQueue((prev) =>
        prev.map((q, idx) =>
          idx === i ? { ...q, status: "uploading", progress: 0, error: undefined } : q
        )
      );

      try {
        const created = await uploadSingleTestCase(
          problemId,
          {
            input: item.inputFile,
            inputFileName: item.inputFile.name,
            expected: item.expectedFile,
            expectedFileName: item.expectedFile.name,
            points: item.points,
          },
          (pct) => {
            setBatchQueue((prev) =>
              prev.map((q, idx) => (idx === i ? { ...q, progress: pct } : q))
            );
          }
        );

        const uploadResult = created as TestCaseMetadata & { allTests?: TestCaseMetadata[] };
        if (uploadResult.allTests && uploadResult.allTests.length > 0) {
          currentTests = uploadResult.allTests;
        } else {
          currentTests = [...currentTests, created];
        }
        onTestsUpdated(currentTests);

        setBatchQueue((prev) =>
          prev.map((q, idx) => (idx === i ? { ...q, status: "success", progress: 100 } : q))
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload error";
        setBatchQueue((prev) =>
          prev.map((q, idx) => (idx === i ? { ...q, status: "error", error: msg } : q))
        );
      }
    }

    try {
      const latestTests = await getProblemTestsAction(problemId);
      if (latestTests && latestTests.length > 0) {
        onTestsUpdated(latestTests);
      }
    } catch {
      // Keep current tests on fetch failure
    }

    setBatchIsRunning(false);
  }

  function handleRemoveBatchItem(index: number) {
    setBatchQueue((prev) => prev.filter((_, idx) => idx !== index));
  }


  async function handleRetryBatchItem(index: number) {
    if (!problemId) return;
    const item = batchQueue[index];
    if (!item) return;

    setBatchQueue((prev) =>
      prev.map((q, idx) =>
        idx === index ? { ...q, status: "uploading", progress: 0, error: undefined } : q
      )
    );

    try {
      const created = await uploadSingleTestCase(
        problemId,
        {
          input: item.inputFile,
          inputFileName: item.inputFile.name,
          expected: item.expectedFile,
          expectedFileName: item.expectedFile.name,
          points: item.points,
        },
        (pct) => {
          setBatchQueue((prev) =>
            prev.map((q, idx) => (idx === index ? { ...q, progress: pct } : q))
          );
        }
      );

      const retryResult = created as TestCaseMetadata & { allTests?: TestCaseMetadata[] };
      if (retryResult.allTests && retryResult.allTests.length > 0) {
        onTestsUpdated(retryResult.allTests);
      } else {
        onTestsUpdated([...tests, created]);
      }

      setBatchQueue((prev) =>
        prev.map((q, idx) => (idx === index ? { ...q, status: "success", progress: 100 } : q))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload error";
      setBatchQueue((prev) =>
        prev.map((q, idx) => (idx === index ? { ...q, status: "error", error: msg } : q))
      );
    }
  }

  function handlePointChange(ordinal: number, pts: number) {
    setPendingPoints((prev) => ({
      ...prev,
      [ordinal]: pts,
    }));
  }

  async function handleSavePoints() {
    if (!problemId) return;
    setSavingPoints(true);

    const mergedPoints: Record<number, number> = {};
    tests.forEach((t) => {
      mergedPoints[t.ordinal] =
        pendingPoints[t.ordinal] !== undefined ? pendingPoints[t.ordinal] : t.points;
    });

    const sum = Object.values(mergedPoints).reduce((a, b) => a + b, 0);
    if (sum !== maxScore) {
      toast.error("Points do not add up", {
        description: `The per-test points total ${sum}, but the problem max score is ${maxScore}.`,
      });
      setSavingPoints(false);
      return;
    }

    try {
      await updateTestPoints(problemId, mergedPoints);
      onTestsUpdated(
        tests.map((t) => ({
          ...t,
          points: mergedPoints[t.ordinal] ?? t.points,
        }))
      );
      setPendingPoints({});
      toast.success("Test case points updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the points."));
    } finally {
      setSavingPoints(false);
    }
  }

  async function handleSplitEvenly() {
    if (!problemId || tests.length === 0) return;
    const evenPoints = generateEvenPoints(tests.length, maxScore);
    const newPointsMap: Record<number, number> = {};
    tests.forEach((t, i) => {
      newPointsMap[t.ordinal] = evenPoints[i] ?? 0;
    });

    setSavingPoints(true);
    try {
      await updateTestPoints(problemId, newPointsMap);
      onTestsUpdated(
        tests.map((t, i) => ({
          ...t,
          points: evenPoints[i] ?? 0,
        }))
      );
      setPendingPoints({});
      toast.success("Points evenly distributed across test cases");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to distribute points evenly."));
    } finally {
      setSavingPoints(false);
    }
  }

  const hasPendingPointChanges = Object.keys(pendingPoints).length > 0;

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "transition-colors",
        dragging && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wider uppercase">
          <CpuIcon className="size-4 text-primary" />
          Evaluation test cases
          <Badge
            variant={scoring.hasMinimumCases ? "default" : "destructive"}
            className="font-mono text-[11px]"
          >
            {tests.length}/{MIN_EVALUATION_TEST_CASES}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hidden from competitors and managed test-by-test. Up to 20 MB per file, uploaded sequentially part-by-part to support large 200+ MB datasets. Drop matching
          <code className="mx-1 font-mono">.in</code>/<code className="mx-1 font-mono">.out</code>
          pairs anywhere on this card to queue them.
        </p>

        <div className="col-start-2 row-span-2 row-start-1 flex flex-wrap items-center justify-end gap-2 self-start">
          {tests.length > 0 && !isNewProblem && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadTestCasesZip(problemId, problemSlug)}
              className="gap-1.5"
            >
              <ArchiveIcon /> Export .zip
            </Button>
          )}

          <input
            type="file"
            ref={batchFileInputRef}
            multiple
            accept=".txt,.in,.out,.ans,.dat"
            onChange={handleBatchFilesSelected}
            hidden
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (isNewProblem) {
                onSaveDraftFirst?.();
                return;
              }
              batchFileInputRef.current?.click();
            }}
            className="gap-1.5"
          >
            <FolderUpIcon /> Batch upload
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (isNewProblem) {
                onSaveDraftFirst?.();
                return;
              }
              openAddSingleModal();
            }}
            className="gap-1.5"
          >
            <PlusIcon /> Add test case
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {isNewProblem && (
          <Alert className="border-warning/40 bg-warning/10">
            <AlertCircleIcon className="text-warning" />
            <AlertDescription className="flex flex-col items-start gap-2 text-warning">
              <span>
                Save this problem as a draft first to enable test case uploads and batch imports.
              </span>
              {onSaveDraftFirst && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={onSaveDraftFirst}
                  className="border-warning/40 text-warning hover:bg-warning/15 hover:text-warning"
                >
                  Save draft now
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <TestCaseLimitsGuide />

        <ScoringSummaryBar
          testCount={tests.length}
          maxScore={maxScore}
          scoring={scoring}
          hasPendingPointChanges={hasPendingPointChanges}
          savingPoints={savingPoints}
          onSavePoints={handleSavePoints}
          onSplitEvenly={handleSplitEvenly}
        />

        <div className="flex flex-col gap-3">
          {tests.length === 0 ? (
            <EmptyState
              icon={<HardDriveIcon />}
              title="No evaluation test cases"
              description="Add cases one at a time (up to 20 MB each), or drop matching input/output file pairs to queue a batch upload."
              action={
                !isNewProblem && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => batchFileInputRef.current?.click()}
                      className="gap-1.5"
                    >
                      <FolderUpIcon /> Upload file pairs
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={openAddSingleModal}
                      className="gap-1.5"
                    >
                      <PlusIcon /> Add first test case
                    </Button>
                  </div>
                )
              }
            />
          ) : (
            tests.map((t) => {
              const currentPoints =
                pendingPoints[t.ordinal] !== undefined ? pendingPoints[t.ordinal] : t.points;

              return (
                <TestCaseItem
                  key={t.ordinal}
                  test={t}
                  points={currentPoints}
                  onPointChange={handlePointChange}
                  onInspect={handleInspect}
                  onDownload={(ord, field) => downloadTestCaseFile(problemId!, ord, field)}
                  onReplace={openReplaceModal}
                  onDelete={setDeleteOrdinal}
                />
              );
            })
          )}
        </div>
      </CardContent>

      {/* Add / Edit Single Test Case Dialog */}
      {problemId && (
        <SingleTestDialog
          open={singleModalOpen}
          onOpenChange={setSingleModalOpen}
          problemId={problemId}
          editTest={editTest}
          onSuccess={handleSingleSuccess}
        />
      )}

      {/* Batch Part-by-Part Upload Queue Dialog */}
      <BatchUploadDialog
        open={batchModalOpen}
        onOpenChange={setBatchModalOpen}
        queue={batchQueue}
        notice={batchNotice}
        isRunning={batchIsRunning}
        onStartBatch={runBatchUploadQueue}
        onRetryItem={handleRetryBatchItem}
        onRemoveItem={handleRemoveBatchItem}
      />

      {/* On-demand Inspector Modal */}
      <TestContentInspectorDialog
        state={inspectModal}
        onClose={() => setInspectModal((prev) => ({ ...prev, open: false }))}
        onCopy={() => toast.success("Copied to clipboard")}
      />

      <ConfirmDialog
        open={deleteOrdinal !== null}
        onOpenChange={(open) => !open && setDeleteOrdinal(null)}
        title="Delete test case"
        description={
          <>
            Permanently delete test case{" "}
            <strong className="text-foreground">#{deleteOrdinal}</strong>? The remaining cases are
            re-sequenced, and any points assigned to it are freed.
          </>
        }
        actionLabel="Delete test case"
        variant="destructive"
        onConfirm={confirmDeleteTest}
      />
    </Card>
  );
}
