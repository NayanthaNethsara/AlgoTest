"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, ShieldAlert } from "lucide-react";
import { apiFetch, getJson } from "@/lib/api";
import type { ProblemDetail, TestCaseInput } from "@/types/problem";

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
      try {
        const data = await getJson<{ problem: ProblemDetail }>(`/api/v1/admin/problems/${problemId}`);
        setProblemDetail(data.problem);
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
      const res = await apiFetch(`/api/v1/admin/problems/${problemId}/tests`, {
        method: "PUT",
        body: JSON.stringify({ tests: formatted }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to update test cases");
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to update test cases.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-xl border bg-card text-card-foreground shadow-2xl my-8">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Hidden Test Cases</h2>
            <p className="text-xs text-muted-foreground">{problemTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {error && (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
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
                <button
                  type="button"
                  onClick={handleAddTest}
                  className="flex items-center text-xs px-3 py-1.5 rounded border bg-background hover:bg-muted font-medium"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Test Case
                </button>
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
                          <button
                            type="button"
                            onClick={() => handleRemoveTest(idx)}
                            className="text-red-500 hover:text-red-600 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm rounded border bg-background hover:bg-muted font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90"
            >
              {saving ? "Saving Test Cases..." : "Replace Test Cases"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
