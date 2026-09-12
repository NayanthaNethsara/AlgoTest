"use client";

import { useState, useRef } from "react";
import {
  Cpu,
  Plus,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Archive,
  FolderUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TestCaseMetadata } from "@/types/problem";
import {
  MIN_EVALUATION_TEST_CASES,
  calculateScoringSummary,
  matchTestFilePairs,
} from "@/lib/testcase-utils";
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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

  function handleSingleSuccess(savedTest: TestCaseMetadata, isEdit: boolean) {
    if (isEdit) {
      onTestsUpdated(tests.map((t) => (t.ordinal === savedTest.ordinal ? savedTest : t)));
      setActionSuccess(`Updated test case #${savedTest.ordinal} successfully.`);
    } else {
      onTestsUpdated([...tests, savedTest]);
      setActionSuccess(`Test case #${savedTest.ordinal} added successfully.`);
    }
  }

  async function handleDeleteTest(ordinal: number) {
    if (!problemId) return;
    if (!confirm(`Are you sure you want to permanently delete test case #${ordinal}?`)) {
      return;
    }

    setActionError(null);
    try {
      await deleteSingleTestCase(problemId, ordinal);
      const remaining = tests
        .filter((t) => t.ordinal !== ordinal)
        .map((t) => (t.ordinal > ordinal ? { ...t, ordinal: t.ordinal - 1 } : t));
      onTestsUpdated(remaining);
      setActionSuccess(`Deleted test case #${ordinal}. Remaining tests re-sequenced.`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to delete test case.");
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
    const files = Array.from(e.target.files || []);
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

    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = "";
    }
  }

  async function runBatchUploadQueue() {
    if (!problemId || batchIsRunning) return;
    setBatchIsRunning(true);

    let currentTests = [...tests];

    for (let i = 0; i < batchQueue.length; i++) {
      const item = batchQueue[i];
      if (item.status === "success") continue;

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

        currentTests = [...currentTests, created];
        onTestsUpdated(currentTests);

        setBatchQueue((prev) =>
          prev.map((q, idx) =>
            idx === i ? { ...q, status: "success", progress: 100 } : q
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload error";
        setBatchQueue((prev) =>
          prev.map((q, idx) =>
            idx === i ? { ...q, status: "error", error: msg } : q
          )
        );
      }
    }

    setBatchIsRunning(false);
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

      onTestsUpdated([...tests, created]);

      setBatchQueue((prev) =>
        prev.map((q, idx) =>
          idx === index ? { ...q, status: "success", progress: 100 } : q
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload error";
      setBatchQueue((prev) =>
        prev.map((q, idx) =>
          idx === index ? { ...q, status: "error", error: msg } : q
        )
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
    setActionError(null);
    setSavingPoints(true);

    const mergedPoints: Record<number, number> = {};
    tests.forEach((t) => {
      mergedPoints[t.ordinal] =
        pendingPoints[t.ordinal] !== undefined ? pendingPoints[t.ordinal] : t.points;
    });

    const sum = Object.values(mergedPoints).reduce((a, b) => a + b, 0);
    if (sum !== maxScore) {
      setActionError(`Points sum (${sum}) must exactly equal problem max score (${maxScore}).`);
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
      setActionSuccess("Points updated successfully.");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to update points.");
    } finally {
      setSavingPoints(false);
    }
  }

  const hasPendingPointChanges = Object.keys(pendingPoints).length > 0;

  return (
    <Card className="p-5 flex flex-col gap-4 shadow-sm border border-border">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Evaluation & Judging Test Cases (Hidden)
            </h2>
            <Badge
              variant={scoring.hasMinimumCases ? "default" : "destructive"}
              className="text-[11px] font-mono"
            >
              {tests.length}/{MIN_EVALUATION_TEST_CASES} Minimum Cases
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Test cases are stored securely in the database and managed <strong>test-case-by-test-case</strong>. Max 20MB per file.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {tests.length > 0 && !isNewProblem && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadTestCasesZip(problemId, problemSlug)}
              className="h-8 text-xs gap-1.5"
              title="Download all test cases as a ZIP archive"
            >
              <Archive className="h-3.5 w-3.5" /> Export All (.zip)
            </Button>
          )}

          <input
            type="file"
            ref={batchFileInputRef}
            multiple
            accept=".txt,.in,.out,.ans,.dat"
            onChange={handleBatchFilesSelected}
            className="hidden"
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
            className="h-8 text-xs gap-1.5"
            title="Select matching .in / .out file pairs to upload part-by-part"
          >
            <FolderUp className="h-3.5 w-3.5" /> Upload Part-by-Part (Batch)
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
            className="h-8 text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add Test Case
          </Button>
        </div>
      </div>

      {/* New problem draft warning banner */}
      {isNewProblem && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3.5 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-warning">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Save the problem as a draft first to enable granular test case uploads, file attachments, and batch queue imports.
            </span>
          </div>
          {onSaveDraftFirst && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onSaveDraftFirst}
              className="h-7 text-xs border-warning/40 text-warning hover:bg-warning/15"
            >
              Save Draft Now
            </Button>
          )}
        </div>
      )}

      {/* Action feedback banners */}
      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs font-medium text-destructive flex items-center justify-between">
          <span>{actionError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActionError(null)}
            className="h-6 px-2 text-[11px]"
          >
            Dismiss
          </Button>
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-md border border-success/40 bg-success/10 p-3 text-xs font-medium text-success flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActionSuccess(null)}
            className="h-6 px-2 text-[11px]"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Scoring summary and points distribution bar */}
      <ScoringSummaryBar
        testCount={tests.length}
        maxScore={maxScore}
        scoring={scoring}
        hasPendingPointChanges={hasPendingPointChanges}
        savingPoints={savingPoints}
        onSavePoints={handleSavePoints}
      />

      {/* Test Cases List */}
      <div className="flex flex-col gap-3">
        {tests.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center space-y-2">
            <HardDrive className="h-8 w-8 text-muted-foreground/50 mx-auto" />
            <p className="text-xs font-semibold text-foreground">No Evaluation Test Cases Added</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Add test cases individually (up to 20MB each) or upload matching file pairs part-by-part with the sequential batch queue.
            </p>
            {!isNewProblem && (
              <div className="pt-2 flex justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => batchFileInputRef.current?.click()}
                  className="h-8 text-xs gap-1.5"
                >
                  <FolderUp className="h-3.5 w-3.5" /> Upload File Pairs
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={openAddSingleModal}
                  className="h-8 text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add First Test Case
                </Button>
              </div>
            )}
          </div>
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
                onDelete={handleDeleteTest}
              />
            );
          })
        )}
      </div>

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
      />

      {/* On-demand Inspector Modal */}
      <TestContentInspectorDialog
        state={inspectModal}
        onClose={() => setInspectModal((prev) => ({ ...prev, open: false }))}
        onCopy={() => setActionSuccess("Content copied to clipboard.")}
      />
    </Card>
  );
}
