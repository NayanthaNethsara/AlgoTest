import { useState, useRef } from "react";
import {
  Cpu,
  Plus,
  Trash2,
  Upload,
  FileUp,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Maximize2,
  HardDrive,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Sample, TestCaseInput } from "@/types/problem";
import {
  MIN_EVALUATION_TEST_CASES,
  findMatchingSample,
  parseBulkTestCases,
  parseFilePairs,
  calculateScoringSummary,
  getTextStats,
  getTextSnippet,
} from "@/lib/testcase-utils";

interface TestCasesTabProps {
  tests: TestCaseInput[];
  samples: Sample[];
  maxScore: number;
  onAddTest: () => void;
  onRemoveTest: (index: number) => void;
  onTestChange: (index: number, field: keyof TestCaseInput, value: string | number) => void;
  onBulkAddTests: (newTests: TestCaseInput[]) => void;
}

export function TestCasesTab({
  tests,
  samples,
  maxScore,
  onAddTest,
  onRemoveTest,
  onTestChange,
  onBulkAddTests,
}: TestCasesTabProps) {
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);
  const [fileImportNotice, setFileImportNotice] = useState<string | null>(null);
  const [collapsedIndices, setCollapsedIndices] = useState<Record<number, boolean>>({});

  // Fullscreen inspector modal state for massive testcases
  const [inspectModal, setInspectModal] = useState<{
    open: boolean;
    caseIndex: number;
    field: "input" | "expected";
    title: string;
    value: string;
  }>({
    open: false,
    caseIndex: 0,
    field: "input",
    title: "",
    value: "",
  });

  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const scoring = calculateScoringSummary(tests, maxScore);

  const areAllCollapsed =
    tests.length > 0 && tests.every((_, idx) => collapsedIndices[idx] === true);

  function toggleCollapse(idx: number) {
    setCollapsedIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  }

  function handleToggleAllCollapse() {
    if (areAllCollapsed) {
      setCollapsedIndices({});
    } else {
      const next: Record<number, boolean> = {};
      tests.forEach((_, idx) => {
        next[idx] = true;
      });
      setCollapsedIndices(next);
    }
  }

  function handleApplyBulkImport() {
    setBulkImportError(null);
    const { testCases, error } = parseBulkTestCases(bulkImportText, tests.length);
    if (error) {
      setBulkImportError(error);
      return;
    }
    if (testCases.length > 0) {
      onBulkAddTests(testCases);
      setBulkImportText("");
      setShowBulkImport(false);
      // Auto-collapse imported large test cases if there are many
      if (testCases.length > 3) {
        const next = { ...collapsedIndices };
        testCases.forEach((_, i) => {
          next[tests.length + i] = true;
        });
        setCollapsedIndices(next);
      }
    }
  }

  async function handleBatchFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setFileImportNotice(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      const { testCases, unmatched } = await parseFilePairs(files, tests.length);
      if (testCases.length > 0) {
        onBulkAddTests(testCases);
        let notice = `Imported ${testCases.length} test case pair(s) from files.`;
        if (unmatched.length > 0) {
          notice += ` ${unmatched.length} file(s) had no matching pair: ${unmatched.join(", ")}`;
        }
        setFileImportNotice(notice);

        // Auto-collapse imported test cases to keep UI clean and manageable
        const next = { ...collapsedIndices };
        testCases.forEach((_, i) => {
          next[tests.length + i] = true;
        });
        setCollapsedIndices(next);
      } else {
        setFileImportNotice(
          "Could not match input/output pairs. Ensure files are named e.g. t1in.txt & t1out.txt or 1.in & 1.out."
        );
      }
    } catch {
      setFileImportNotice("Failed to read files. Please try again.");
    } finally {
      if (batchFileInputRef.current) {
        batchFileInputRef.current.value = "";
      }
    }
  }

  async function handleSingleFileUpload(
    idx: number,
    field: "input" | "expected",
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      onTestChange(idx, field, content);
    } catch {
      // Ignore read errors
    } finally {
      e.target.value = "";
    }
  }

  function openInspector(idx: number, field: "input" | "expected") {
    const t = tests[idx];
    if (!t) return;
    const isInput = field === "input";
    setInspectModal({
      open: true,
      caseIndex: idx,
      field,
      title: `Case #${idx + 1} ${isInput ? "Standard Input (stdin)" : "Expected Output (stdout)"}`,
      value: isInput ? t.input : t.expected,
    });
  }

  function handleSaveInspector() {
    onTestChange(inspectModal.caseIndex, inspectModal.field, inspectModal.value);
    setInspectModal((prev) => ({ ...prev, open: false }));
  }

  return (
    <Card className="p-5 flex flex-col gap-4 shadow-sm border border-border">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
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
            Hidden from contestants. Used by the judge runner to score submissions.{" "}
            <strong>Must be distinct from public statement samples.</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {tests.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleAllCollapse}
              className="h-8 text-xs gap-1.5"
              title="Expand or collapse all test case cards"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              <span>{areAllCollapsed ? "Expand All" : "Collapse All"}</span>
            </Button>
          )}

          <input
            type="file"
            ref={batchFileInputRef}
            multiple
            accept=".txt,.in,.out,.ans,.dat"
            onChange={handleBatchFileUpload}
            className="hidden"
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => batchFileInputRef.current?.click()}
            className="h-8 text-xs gap-1.5"
            title="Select matching .in / .out or .txt files (e.g. t1in.txt & t1out.txt)"
          >
            <FileUp className="h-3.5 w-3.5" /> Batch Upload Files
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowBulkImport(!showBulkImport)}
            className="h-8 text-xs gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" /> Bulk JSON Import
          </Button>

          <Button type="button" size="sm" onClick={onAddTest} className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Test Case
          </Button>
        </div>
      </div>

      {fileImportNotice && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3.5 py-2 flex items-center justify-between gap-2 text-xs">
          <span className="text-primary font-medium">{fileImportNotice}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFileImportNotice(null)}
            className="h-6 px-2 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Requirements and Scoring Banner */}
      <div className="rounded-md border bg-muted/20 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {scoring.hasMinimumCases ? (
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          )}
          <span>
            {!scoring.hasMinimumCases
              ? `At least ${MIN_EVALUATION_TEST_CASES} distinct evaluation test cases are required (currently ${tests.length}).`
              : scoring.hasCustomPoints
                ? `Custom scoring: ${scoring.customPointsSum} / ${maxScore} points assigned across ${tests.length} cases.`
                : `Auto-distribution: ${maxScore} max points distributed evenly (~${scoring.autoPointPerTest} pts per case).`}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground font-mono">
          Problem Max Score: {maxScore} pts
        </div>
      </div>

      {/* Bulk import panel */}
      {showBulkImport && (
        <div className="rounded-lg border bg-background/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground">
              Paste Test Cases JSON Array
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
            className="font-mono text-xs max-h-48"
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
            <Button type="button" size="sm" onClick={handleApplyBulkImport} className="h-8 text-xs">
              Apply Import
            </Button>
          </div>
        </div>
      )}

      {/* Test cases list */}
      <div className="flex flex-col gap-3">
        {tests.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
            <HelpCircle className="h-8 w-8 text-muted-foreground/60 mx-auto" />
            <p className="text-xs font-medium text-foreground">No Evaluation Test Cases</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Every problem requires at least {MIN_EVALUATION_TEST_CASES} evaluation test cases to
              be judged. Evaluation test cases must be distinct from public statement samples.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <Button type="button" size="sm" onClick={onAddTest} className="h-8 text-xs gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add First Test Case
              </Button>
            </div>
          </div>
        ) : (
          tests.map((t, idx) => {
            const matchedSample = findMatchingSample(t, samples);
            const isDuplicate = Boolean(matchedSample);
            const isCollapsed = Boolean(collapsedIndices[idx]);

            const inStats = getTextStats(t.input);
            const outStats = getTextStats(t.expected);

            return (
              <div
                key={idx}
                className={`rounded-lg border transition-all ${
                  isDuplicate
                    ? "border-destructive/60 bg-destructive/5"
                    : "border-border bg-muted/10 hover:border-border/80"
                }`}
              >
                {/* Header Row (Click to Collapse / Expand) */}
                <div className="p-3 sm:p-3.5 flex items-center justify-between gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(idx)}
                    className="flex items-center gap-2 sm:gap-3 text-left flex-1 min-w-0 cursor-pointer group"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    )}

                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Case #{idx + 1}
                    </span>

                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                      {Number(t.points) > 0 ? `${t.points} pts` : "Auto-pts"}
                    </Badge>

                    {/* Data Size / Line Badge */}
                    <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground shrink-0">
                      <HardDrive className="h-3 w-3" />
                      <span>
                        In: {inStats.formattedSize} ({inStats.lines}L) • Out: {outStats.formattedSize} ({outStats.lines}L)
                      </span>
                    </div>

                    {/* Collapsed single-line preview snippet */}
                    {isCollapsed && (
                      <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-muted-foreground truncate max-w-md">
                        <span className="truncate">
                          In: &quot;{getTextSnippet(t.input, 25)}&quot;
                        </span>
                        <span>→</span>
                        <span className="truncate">
                          Out: &quot;{getTextSnippet(t.expected, 20)}&quot;
                        </span>
                      </div>
                    )}

                    {isDuplicate && (
                      <Badge variant="destructive" className="text-[10px] gap-1 shrink-0">
                        <AlertCircle className="h-3 w-3" /> Duplicate
                      </Badge>
                    )}
                  </button>

                  {/* Actions Row */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] text-muted-foreground whitespace-nowrap hidden sm:inline">
                        Points:
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={t.points || 0}
                        onChange={(e) => onTestChange(idx, "points", Number(e.target.value))}
                        placeholder="0"
                        className="h-7 w-16 sm:w-20 text-xs font-mono"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCollapse(idx)}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hidden sm:flex"
                    >
                      {isCollapsed ? "Expand" : "Collapse"}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveTest(idx)}
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      title="Delete test case"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Collapsible Content Body */}
                {!isCollapsed && (
                  <div className="px-3 sm:px-4 pb-4 pt-1 border-t border-border/50 space-y-3">
                    {isDuplicate && (
                      <div className="rounded border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
                        Evaluation test cases cannot be identical to public sample test cases. Please
                        provide a distinct test case for judging.
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Input (stdin) Box */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">
                              Input (stdin) *
                            </label>
                            <span className="text-[10px] font-mono text-muted-foreground/80">
                              ({inStats.lines} lines, {inStats.formattedSize})
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openInspector(idx, "input")}
                              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                              title="Open full-screen editor for large input"
                            >
                              <Maximize2 className="h-3 w-3" />
                              <span>View Full</span>
                            </button>

                            <label className="cursor-pointer inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                              <FileText className="h-3 w-3" />
                              <span>Upload File</span>
                              <input
                                type="file"
                                accept=".txt,.in,.dat"
                                onChange={(e) => handleSingleFileUpload(idx, "input", e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        <Textarea
                          value={t.input}
                          onChange={(e) => onTestChange(idx, "input", e.target.value)}
                          placeholder="Input data supplied to student code..."
                          className="font-mono text-xs leading-relaxed h-36 max-h-52 overflow-y-auto resize-y"
                          required
                        />
                      </div>

                      {/* Expected Output (stdout) Box */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">
                              Expected Output (stdout) *
                            </label>
                            <span className="text-[10px] font-mono text-muted-foreground/80">
                              ({outStats.lines} lines, {outStats.formattedSize})
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openInspector(idx, "expected")}
                              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                              title="Open full-screen editor for large output"
                            >
                              <Maximize2 className="h-3 w-3" />
                              <span>View Full</span>
                            </button>

                            <label className="cursor-pointer inline-flex items-center gap-1 text-primary hover:underline text-[11px]">
                              <FileText className="h-3 w-3" />
                              <span>Upload File</span>
                              <input
                                type="file"
                                accept=".txt,.out,.ans,.dat"
                                onChange={(e) => handleSingleFileUpload(idx, "expected", e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        <Textarea
                          value={t.expected}
                          onChange={(e) => onTestChange(idx, "expected", e.target.value)}
                          placeholder="Exact output expected from program..."
                          className="font-mono text-xs leading-relaxed h-36 max-h-52 overflow-y-auto resize-y"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Large Content Inspector Modal */}
      <Dialog
        open={inspectModal.open}
        onOpenChange={(open) => setInspectModal((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center justify-between pr-6">
              <span>{inspectModal.title}</span>
              <span className="text-xs font-mono text-muted-foreground font-normal">
                {getTextStats(inspectModal.value).lines} lines • {getTextStats(inspectModal.value).formattedSize}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 py-2">
            <Textarea
              value={inspectModal.value}
              onChange={(e) =>
                setInspectModal((prev) => ({ ...prev, value: e.target.value }))
              }
              placeholder="Content..."
              className="font-mono text-xs leading-relaxed h-[55vh] resize-none overflow-y-auto w-full"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInspectModal((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSaveInspector}>
              Save & Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
