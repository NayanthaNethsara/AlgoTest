"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ShieldAlert } from "lucide-react";
import { getProblemDetailAction, getProblemTestsAction, replaceTestCasesAction } from "@/lib/actions/problems";
import type { ProblemDetail, TestCaseInput } from "@/types/problem";
import { ConfirmDialog } from "./confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
    { ordinal: 1, input: "", expected: "", points: 1 },
  ]);

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
      { ordinal: prev.length + 1, input: "", expected: "", points: 1 },
    ]);
  }

  function handleRemoveTest(index: number) {
    setTestCases((prev) => prev.filter((_, i) => i !== index));
  }

  function handleChangeTest(index: number, field: keyof TestCaseInput, value: string | number) {
    setTestCases((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  function promptSaveConfirmation() {
    setError(null);
    if (testCases.some((t) => !t.input.trim() || !t.expected.trim())) {
      setError("All test cases must have non-empty Input and Expected Output.");
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
        points: Number(t.points) || 1,
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hidden Test Cases</DialogTitle>
            <DialogDescription className="text-xs">{problemTitle}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-6 pt-2">
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}

            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground font-medium">Loading test cases...</div>
            ) : (
              <>
                {problemDetail?.tests && problemDetail.tests.length > 0 && (
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <ShieldAlert className="h-4 w-4 text-primary" /> Stored Test Hashes ({problemDetail.tests.length})
                    </div>
                    <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto text-xs font-mono">
                      {problemDetail.tests.map((t) => (
                        <div key={t.id} className="flex items-center justify-between border-b border-border/40 py-1">
                          <span>Test #{t.ordinal} ({t.points} pts)</span>
                          <span className="text-muted-foreground text-[10px]">
                            In: {t.inputSha.substring(0, 10)}... | Exp: {t.expectedSha.substring(0, 10)}...
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Replace / Upload New Test Cases
                  </span>
                  <Button variant="outline" size="sm" onClick={handleAddTest} className="h-8 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add Test Case
                  </Button>
                </div>

                <div className="flex flex-col gap-4 max-h-[380px] overflow-y-auto pr-1">
                  {testCases.map((t, idx) => (
                    <div key={idx} className="rounded-lg border p-4 bg-muted/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Test #{idx + 1}
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-muted-foreground">Points:</label>
                            <Input
                              type="number"
                              value={t.points}
                              onChange={(e) => handleChangeTest(idx, "points", Number(e.target.value))}
                              min={1}
                              className="w-16 h-7 text-xs"
                            />
                          </div>
                          {testCases.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveTest(idx)}
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Input Data</label>
                          <Textarea
                            value={t.input}
                            onChange={(e) => handleChangeTest(idx, "input", e.target.value)}
                            rows={4}
                            placeholder="Standard Input..."
                            className="font-mono text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Expected Output</label>
                          <Textarea
                            value={t.expected}
                            onChange={(e) => handleChangeTest(idx, "expected", e.target.value)}
                            rows={4}
                            placeholder="Expected Standard Output..."
                            className="font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={promptSaveConfirmation} disabled={saving || loading}>
                {saving ? "Saving Test Cases..." : "Replace Test Cases"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Replace Test Cases"
        description={
          <>
            Are you sure you want to replace all test cases for <strong className="text-foreground">{problemTitle}</strong>? All existing test case inputs and expected outputs will be overwritten.
          </>
        }
        actionLabel="Replace Test Cases"
        onConfirm={confirmSave}
      />
    </>
  );
}
