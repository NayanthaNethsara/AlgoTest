"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminProblemDetail, replaceTestCasesAction, type ProblemDetail, type TestCaseInput } from "@/actions/problems";

type TestCaseManagerProps = {
  problemId: string;
  problemTitle: string;
  onClose: () => void;
};

export function TestCaseManager({ problemId, problemTitle, onClose }: TestCaseManagerProps) {
  const [problemDetail, setProblemDetail] = useState<ProblemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testCases, setTestCases] = useState<TestCaseInput[]>([
    { ordinal: 1, input: "", expected: "", points: 1 },
  ]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await getAdminProblemDetail(problemId);
      if (res.problem) {
        setProblemDetail(res.problem);
      } else if (res.error) {
        setError(res.error);
      }
      setLoading(false);
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

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const formatted = testCases.map((t, i) => ({
        ordinal: i + 1,
        input: t.input,
        expected: t.expected,
        points: Number(t.points) || 1,
      }));
      const res = await replaceTestCasesAction(problemId, formatted);
      if (res.error) {
        setError(res.error);
      } else {
        onClose();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update test cases.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-xl border bg-card text-card-foreground shadow-2xl my-8">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Hidden Test Cases</h2>
            <p className="text-xs text-muted-foreground">{problemTitle}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading test cases...</div>
          ) : (
            <>
              {problemDetail?.tests && problemDetail.tests.length > 0 && (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ShieldAlert className="h-4 w-4 text-primary" /> Current Stored Test Hashes ({problemDetail.tests.length})
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
                <span className="text-sm font-medium">Replace / Upload New Test Cases</span>
                <Button type="button" variant="outline" size="sm" onClick={handleAddTest}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Test Case
                </Button>
              </div>

              <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-1">
                {testCases.map((t, idx) => (
                  <div key={idx} className="rounded-lg border p-4 bg-muted/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Test #{idx + 1}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-muted-foreground">Points:</label>
                          <input
                            type="number"
                            value={t.points}
                            onChange={(e) => handleChangeTest(idx, "points", Number(e.target.value))}
                            min={1}
                            className="w-16 h-7 rounded border bg-background px-2 text-xs"
                          />
                        </div>
                        {testCases.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveTest(idx)}
                            className="h-6 w-6 text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Input Data</label>
                        <textarea
                          value={t.input}
                          onChange={(e) => handleChangeTest(idx, "input", e.target.value)}
                          rows={4}
                          placeholder="Standard Input..."
                          className="w-full rounded-md border bg-background p-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Expected Output</label>
                        <textarea
                          value={t.expected}
                          onChange={(e) => handleChangeTest(idx, "expected", e.target.value)}
                          rows={4}
                          placeholder="Expected Standard Output..."
                          className="w-full rounded-md border bg-background p-2 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving Test Cases..." : "Replace Test Cases"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
