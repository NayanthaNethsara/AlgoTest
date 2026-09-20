"use client";

import { useEffect, useRef, useState } from "react";
import { History, Play, Send } from "lucide-react";
import { runCode } from "@/actions/code";
import { useContest } from "@/components/portal/contest-provider";
import { useSubmissions } from "@/components/portal/submissions-provider";
import { CodeEditor, type EditorTelemetry } from "@/components/workspace/code-editor";
import { HistoryPanel } from "@/components/workspace/history-panel";
import { IoPanels } from "@/components/workspace/io-panels";
import { SubmissionResult } from "@/components/workspace/submission-result";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CustomSelect } from "@/components/ui/custom-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadSnapshots, useHistory } from "@/hooks/use-history";
import { BEST_SCORE_STORAGE_PREFIX } from "@/lib/constants";
import { getLanguage, LANGUAGE_OPTIONS, LANGUAGES } from "@/lib/languages";
import type { Language, RunResult, SubmitResult } from "@/types/code";
import type { Snapshot } from "@/types/history";
import type { Problem } from "@/types/problem";

const isRunFeatureEnabled =
  process.env.NEXT_PUBLIC_ENABLE_RUN !== "false" &&
  process.env.NEXT_PUBLIC_DISABLE_RUN !== "true";

function readStoredBest(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(localStorage.getItem(key) ?? 0);
  } catch {
    return 0;
  }
}

export function CodeWorkspace({ problem }: { problem: Problem }) {
  const { isNotStarted, isPaused, isEnded } = useContest();
  const [language, setLanguage] = useState<Language>(LANGUAGES[0]);
  const [code, setCode] = useState(LANGUAGES[0].starter);
  const [stdin, setStdin] = useState(problem.samples[0]?.input ?? "");
  const hasEdited = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasEdited.current) return;
      const draft = loadSnapshots(problem.id)[0];
      if (!draft) return;
      const draftLanguage = getLanguage(draft.language) ?? LANGUAGES[0];
      setLanguage(draftLanguage);
      setCode(draft.code);
    }, 0);
    return () => clearTimeout(timer);
  }, [problem.id]);

  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);

  const { activeSubmissions, lastResult, submitFast } = useSubmissions();
  const activeSubmission = Object.values(activeSubmissions).find(
    (submission) => submission.problemId === problem.id,
  );
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editorTelemetry, setEditorTelemetry] = useState<EditorTelemetry | undefined>();

  const [tab, setTab] = useState(() => (isRunFeatureEnabled ? "test" : "submission"));
  const [historyOpen, setHistoryOpen] = useState(false);

  const { snapshots, record } = useHistory(problem.id);
  const bestKey = `${BEST_SCORE_STORAGE_PREFIX}${problem.id}`;
  const storedBest = useRef(readStoredBest(bestKey));

  const isCurrentProblemSubmitting =
    submitting || activeSubmission?.problemId === problem.id;

  const activeResult =
    lastResult && lastResult.problemId === problem.id
      ? lastResult
      : submitResult;

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => record("autosave", language.id, code), 1500);
    return () => clearTimeout(timer);
  }, [code, language.id, record]);

  const recordedResult = useRef<string | null>(null);
  useEffect(() => {
    const id = activeResult?.submissionId;
    if (!id) return;

    const resultVersion = [
      id,
      activeResult.status,
      activeResult.verdict,
      activeResult.score,
      activeResult.maxScore,
    ].join(":");
    if (recordedResult.current === resultVersion) return;
    recordedResult.current = resultVersion;

    if (activeResult.score > storedBest.current) {
      storedBest.current = activeResult.score;
      try {
        localStorage.setItem(bestKey, String(activeResult.score));
      } catch {}
    }
    record("submitted", language.id, code, {
      submissionId: id,
      verdict: activeResult.verdict,
      score: activeResult.score,
      maxScore: activeResult.maxScore,
    });
  }, [activeResult, bestKey, language.id, code, record]);

  const [runCooldown, setRunCooldown] = useState(0);
  const [submitCooldown, setSubmitCooldown] = useState(0);

  useEffect(() => {
    if (runCooldown <= 0) return;
    const timer = setInterval(() => {
      setRunCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [runCooldown]);

  useEffect(() => {
    if (submitCooldown <= 0) return;
    const timer = setInterval(() => {
      setSubmitCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [submitCooldown]);

  function handleLanguageChange(id: string | null) {
    const next = LANGUAGES.find((lang) => lang.id === id) ?? LANGUAGES[0];
    record("autosave", language.id, code);
    const savedDraft = snapshots.find(
      (snapshot) => snapshot.language === next.id,
    );
    setLanguage(next);
    setCode(savedDraft?.code ?? next.starter);
  }

  function handleCodeChange(next: string) {
    hasEdited.current = true;
    setCode(next);
  }

  async function handleRun() {
    if (!isRunFeatureEnabled || running || runCooldown > 0 || isPaused || isNotStarted) return;
    if (!code.trim()) {
      setTab("test");
      setRunResult({ stdout: "", stderr: "Error: Cannot run empty code", exitCode: 1, timeMs: 0 });
      return;
    }

    setTab("test");
    setRunning(true);
    setRunResult(null);
    record("ran", language.id, code);
    try {
      setRunResult(await runCode(language.id, code, stdin, problem.id));
      setRunCooldown(3);
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmit() {
    if (isCurrentProblemSubmitting || submitCooldown > 0 || isPaused || isEnded || isNotStarted) return;
    setTab("submission");
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const previousBest = Math.max(
        storedBest.current,
        activeResult?.score ?? 0,
      );
      const res = await submitFast(
        problem.id,
        code,
        previousBest,
        language.id,
        editorTelemetry,
      );
      setSubmitResult(res);
      setSubmitCooldown(3);
      if (res.submissionId) {
        record("submitted", language.id, code, {
          submissionId: res.submissionId,
          score: res.score,
          maxScore: res.maxScore,
          verdict: res.verdict,
        });
      }
    } finally {
      setSubmitting(false);
      setSubmitCooldown(3);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) {
            void handleSubmit();
          } else if (isRunFeatureEnabled) {
            void handleRun();
          } else {
            void handleSubmit();
          }
        } else if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          record("autosave", language.id, code);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function handleRestore(snapshot: Snapshot) {
    const restoredLanguage = getLanguage(snapshot.language);
    if (restoredLanguage) setLanguage(restoredLanguage);
    setCode(snapshot.code);
  }

  const isRunDisabled = !isRunFeatureEnabled || running || runCooldown > 0 || isPaused || isNotStarted;
  const isSubmitDisabled =
    Boolean(isCurrentProblemSubmitting) || submitCooldown > 0 || isPaused || isEnded || isNotStarted;

  return (
    <div className="flex h-full flex-col font-mono">
      <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-card px-3 py-2">
        <CustomSelect
          value={language.id}
          onValueChange={handleLanguageChange}
          options={LANGUAGE_OPTIONS}
          size="sm"
          triggerClassName="w-36 bg-input text-xs"
          aria-label="Select programming language"
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHistoryOpen(true)}
          className="text-xs"
        >
          <History className="size-3.5" />
          History
        </Button>
      </div>

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="62" minSize="30">
          <div className="h-full border-b-2 border-border">
            <CodeEditor
              language={language.monaco}
              value={code}
              onChange={handleCodeChange}
              onTelemetryChange={setEditorTelemetry}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border" />

        <ResizablePanel defaultSize="38" minSize="20">
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex h-full flex-col gap-0"
          >
            <div className="flex items-center justify-between gap-3 border-b-2 border-border bg-card px-3 py-1.5">
              <TabsList>
                {isRunFeatureEnabled && <TabsTrigger value="test">Test</TabsTrigger>}
                <TabsTrigger value="submission">Submission</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-3">
                <span className="hidden text-[11px] text-muted-foreground lg:inline">
                  {isPaused
                    ? "Contest paused by judges · Execution locked"
                    : isEnded
                      ? "Contest ended · Practice mode active (Submissions closed)"
                      : isNotStarted
                        ? "Contest not started · Submissions locked"
                        : isRunFeatureEnabled
                          ? "Run uses your test input · Submit scores against hidden tests"
                          : "Submit scores against hidden tests"}
                </span>
                {isRunFeatureEnabled && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRun}
                    disabled={isRunDisabled}
                    title="Run Code (Ctrl+Enter / Cmd+Enter)"
                  >
                    <Play className="size-3.5" />
                    {isPaused
                      ? "Paused"
                      : running
                        ? "Running..."
                        : runCooldown > 0
                          ? `Run (${runCooldown}s)`
                          : "Run"}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled}
                  title="Submit Solution (Ctrl+Shift+Enter / Cmd+Shift+Enter)"
                >
                  <Send className="size-3.5" />
                  {isEnded
                    ? "Contest Ended"
                    : isPaused
                      ? "Paused"
                      : isNotStarted
                        ? "Not Started"
                        : isCurrentProblemSubmitting
                          ? "Submitting..."
                          : submitCooldown > 0
                            ? `Submit (${submitCooldown}s)`
                            : "Submit"}
                </Button>
              </div>
            </div>

            {isRunFeatureEnabled && (
              <TabsContent value="test" className="flex min-h-0 flex-1 flex-col">
                <IoPanels
                  stdin={stdin}
                  onStdinChange={setStdin}
                  result={runResult}
                  running={running}
                />
              </TabsContent>
            )}

            <TabsContent
              value="submission"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <SubmissionResult
                result={activeResult}
                submitting={Boolean(isCurrentProblemSubmitting)}
                testsDone={activeSubmission?.testsDone}
                testsTotal={activeSubmission?.testsTotal}
                statusMessage={
                  activeSubmission
                    ? activeSubmission.status === "queued"
                      ? `Queued (Position #${activeSubmission.queuePosition ?? 1} in line)...`
                      : activeSubmission.testsTotal
                        ? `Evaluating test cases (${activeSubmission.testsDone ?? 0}/${activeSubmission.testsTotal})...`
                        : "Evaluating against test cases..."
                    : "Submitting to queue..."
                }
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>

      <HistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        snapshots={snapshots}
        onRestore={handleRestore}
      />
    </div>
  );
}
