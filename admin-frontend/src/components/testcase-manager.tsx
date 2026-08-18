"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Cpu,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Upload,
} from "lucide-react";
import {
  getProblemDetailAction,
  getProblemTestsAction,
  replaceTestCasesAction,
} from "@/lib/actions/problems";
import type { ProblemDetail, TestCaseInput } from "@/types/problem";
import { ConfirmDialog } from "./confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MIN_EVALUATION_TEST_CASES,
  findMatchingSample,
  parseBulkTestCases,
  calculateScoringSummary,
} from "@/lib/testcase-utils";

type TestCaseManagerProps = {
  problemId: string;
  problemTitle: string;
  onClose: () => void;
};

export function TestCaseManager({ problemId, problemTitle, onClose }: TestCaseManagerProps) {
  const [problemDetail, setProblemDetail] = useState<ProblemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testCases, setTestCases] = useState<TestCaseInput[]>([
    { ordinal: 1, input: "", expected: "", points: 0 },
  ]);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [data, fullTests] = await Promise.all([
          getProblemDetailAction(problemId),
          getProblemTestsAction(problemId).catch(() => []),
        ]);
        setProblemDetail(data);
        if (fullTests && fullTests.length > 0) {
          setTestCases(fullTests);
        }
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [problemId]);

  function handleAddTest() {
    setTestCases((prev) => [
      ...prev,
      { ordinal: prev.length + 1, input: "", expected: "", points: 0 },
    ]);
  }

  function handleRemoveTest(index: number) {
    setTestCases((prev) =>
      prev.filter((_, i) => i !== index).map((t, idx) => ({ ...t, ordinal: idx + 1 }))
    );
  }

  function handleChangeTest(index: number, field: keyof TestCaseInput, value: string | number) {
    setTestCases((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function handleApplyBulkImport() {
    setBulkImportError(null);
    const { testCases: parsed, error } = parseBulkTestCases(bulkImportText, testCases.length);
    if (error) {
      setBulkImportError(error);
      return;
    }
    if (parsed.length > 0) {
      setTestCases((prev) => [...prev, ...parsed]);
      setBulkImportText("");
      setShowBulkImport(false);
    }
  }

  const isProblemPublished = Boolean(problemDetail?.published);
  const maxScore = problemDetail?.maxScore ?? 100;
  const samples = problemDetail?.samples ?? [];
  const scoring = calculateScoringSummary(testCases, maxScore);

  function promptSaveConfirmation() {
    setError(null);

    if (testCases.some((t) => !t.input.trim() || !t.expected.trim())) {
      setError("All evaluation test cases must have non-empty Input and Expected Output.");
      return;
    }

    if (isProblemPublished && testCases.length < MIN_EVALUATION_TEST_CASES) {
      setError(
        `This problem is currently Published. It requires at least ${MIN_EVALUATION_TEST_CASES} evaluation test cases before updating.`
      );
      return;
    }

    const duplicateTest = testCases.find((t) => findMatchingSample(t, samples));
    if (duplicateTest) {
      const matched = findMatchingSample(duplicateTest, samples)!;
      setError(
        `Evaluation test case #${duplicateTest.ordinal} is identical to public Sample #${matched.ordinal}. Evaluation test cases must be distinct from public statement samples.`
      );
      return;
    }

    setShowConfirm(true);
  }

  async function confirmSave() {
    setShowConfirm(false);
    setError(null);
    setSaving(true);
    try {
      const formatted = testCases.map((t, i) => ({
        ordinal: i + 1,
        input: t.input,
        expected: t.expected,
        points: Number(t.points) || 0,
      }));
      await replaceTestCasesAction(problemId, formatted);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to update test cases.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                <DialogTitle className="text-base font-semibold">{problemTitle}</DialogTitle>
                <Badge variant={isProblemPublished ? "default" : "secondary"} className="text-xs">
                  {isProblemPublished ? "Published" : "Draft"}
                </Badge>
              </div>
              <Badge
                variant={scoring.hasMinimumCases ? "default" : "destructive"}
                className="text-[11px] font-mono"
              >
                {testCases.length}/{MIN_EVALUATION_TEST_CASES} Minimum Cases
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Official evaluation test cases used to score contestant code. Strictly hidden from competitors and distinct from public statement samples.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 pt-2">
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center text-xs text-muted-foreground font-medium">
                Loading test cases...
              </div>
            ) : (
              <>
                {/* Scoring distribution banner */}
                <div className="rounded-md border bg-muted/20 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {scoring.hasMinimumCases ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span>
                      {!scoring.hasMinimumCases
                        ? `At least ${MIN_EVALUATION_TEST_CASES} evaluation test cases required (currently ${testCases.length}).`
                        : scoring.hasCustomPoints
                        ? `Custom scoring: ${scoring.customPointsSum} / ${maxScore} points allocated across ${testCases.length} test cases.`
                        : `Auto-distribution: ${maxScore} max points distributed evenly (~${scoring.autoPointPerTest} pts per case).`}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Problem Max Score: {maxScore} pts
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Evaluation Test Cases ({testCases.length})
                  </span>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBulkImport(!showBulkImport)}
                      className="h-8 text-xs gap-1.5"
                    >
                      <Upload className="h-3.5 w-3.5" /> Bulk JSON Import
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddTest}
                      className="h-8 text-xs gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Test Case
                    </Button>
                  </div>
                </div>

                {/* Bulk Import Box */}
                {showBulkImport && (
                  <div className="rounded-lg border bg-background/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">
                        Paste JSON Array of Test Cases
                      </label>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Format: [{`{"input": "...", "expected": "...", "points": 20}`}]
                      </span>
                    </div>

                    <Textarea
                      value={bulkImportText}
                      onChange={(e) => setBulkImportText(e.target.value)}
                      rows={5}
                      placeholder={`[\n  {\n    "input": "100\\n...",\n    "expected": "4950",\n    "points": 20\n  }\n]`}
                      className="font-mono text-xs"
                    />

                    {bulkImportError && (
                      <p className="text-xs text-destructive font-medium">{bulkImportError}</p>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowBulkImport(false);
                          setBulkImportText("");
                          setBulkImportError(null);
                        }}
                        className="h-8 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleApplyBulkImport}
                        className="h-8 text-xs"
                      >
                        Apply Import
                      </Button>
                    </div>
                  </div>
                )}

                {/* Test Cases List */}
                <div className="flex flex-col gap-4 max-h-[460px] overflow-y-auto pr-1.5">
                  {testCases.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
                      <p className="text-xs font-medium text-foreground">No Test Cases Added</p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        Click &quot;Add Test Case&quot; or &quot;Bulk JSON Import&quot; to define evaluation test cases.
                      </p>
                    </div>
                  ) : (
                    testCases.map((t, idx) => {
                      const matchedSample = findMatchingSample(t, samples);
                      const isDuplicate = Boolean(matchedSample);

                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border p-4 bg-muted/10 space-y-3 ${
                            isDuplicate ? "border-destructive/60 bg-destructive/5" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Case #{idx + 1}
                              </span>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {Number(t.points) > 0 ? `${t.points} pts` : "Auto-pts"}
                              </Badge>
                              {isDuplicate && (
                                <Badge variant="destructive" className="text-[10px] gap-1">
                                  <AlertCircle className="h-3 w-3" /> Matches Public Sample #{matchedSample?.ordinal}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <label className="text-[11px] text-muted-foreground whitespace-nowrap">
                                  Points:
                                </label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={t.points || 0}
                                  onChange={(e) =>
                                    handleChangeTest(idx, "points", Number(e.target.value))
                                  }
                                  placeholder="0 (auto)"
                                  className="w-20 h-7 text-xs font-mono"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveTest(idx)}
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {isDuplicate && (
                            <div className="rounded border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
                              Evaluation test cases cannot be identical to public sample test cases. Please provide a distinct test case for judging.
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                Standard Input (stdin) *
                              </label>
                              <Textarea
                                value={t.input}
                                onChange={(e) => handleChangeTest(idx, "input", e.target.value)}
                                rows={4}
                                placeholder="Input data supplied to student code..."
                                className="font-mono text-xs leading-relaxed"
                                required
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                Expected Output (stdout) *
                              </label>
                              <Textarea
                                value={t.expected}
                                onChange={(e) => handleChangeTest(idx, "expected", e.target.value)}
                                rows={4}
                                placeholder="Expected standard output..."
                                className="font-mono text-xs leading-relaxed"
                                required
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-[11px] text-muted-foreground">
                {testCases.length} total test case(s) ready to save
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={promptSaveConfirmation} disabled={saving || loading}>
                  {saving ? "Saving Test Cases..." : "Save Test Cases"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Confirm Test Cases Replacement"
        description={
          <>
            Are you sure you want to replace all evaluation test cases for{" "}
            <strong className="text-foreground">{problemTitle}</strong> with the {testCases.length}{" "}
            test case(s) above?
          </>
        }
        actionLabel="Save & Replace"
        onConfirm={confirmSave}
      />
    </>
  );
}
