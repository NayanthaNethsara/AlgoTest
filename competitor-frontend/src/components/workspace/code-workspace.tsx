"use client";

import { useEffect, useRef, useState } from "react";
import { History, Play, Send } from "lucide-react";
import { runCode } from "@/actions/code";
import { CodeEditor } from "@/components/workspace/code-editor";
import { HistoryPanel } from "@/components/workspace/history-panel";
import { IoPanels } from "@/components/workspace/io-panels";
import { SubmissionResult } from "@/components/workspace/submission-result";
import { useSubmissions } from "@/components/providers/submissions-context";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHistory } from "@/hooks/use-history";
import { LANGUAGES } from "@/lib/languages";
import type { Language, RunResult, SubmitResult } from "@/types/code";
import type { Snapshot } from "@/types/history";
import type { Problem } from "@/types/problem";

export function CodeWorkspace({ problem }: { problem: Problem }) {
  const [language, setLanguage] = useState<Language>(LANGUAGES[0]);
  const [code, setCode] = useState(LANGUAGES[0].starter);
  const [stdin, setStdin] = useState(problem.samples[0]?.input ?? "");

  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);

  const { activeSubmission, lastResult, submitFast } = useSubmissions();
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [tab, setTab] = useState("test");
  const [historyOpen, setHistoryOpen] = useState(false);

  const { snapshots, record } = useHistory(problem.id);
  const bestKey = `mini-algothon:best:${problem.id}`;
  const [best, setBest] = useState(() =>
    typeof window === "undefined" ? 0 : Number(localStorage.getItem(bestKey) ?? 0),
  );

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => record("autosave", language.id, code), 1500);
    return () => clearTimeout(timer);
  }, [code, language.id, record]);

  useEffect(() => {
    if (lastResult && lastResult.submissionId) {
      setSubmitResult(lastResult);
      if (lastResult.improvedBest && lastResult.score > best) {
        setBest(lastResult.score);
        localStorage.setItem(bestKey, String(lastResult.score));
      }
    }
  }, [lastResult, best, bestKey]);

  function handleLanguageChange(id: string | null) {
    const next = LANGUAGES.find((lang) => lang.id === id) ?? LANGUAGES[0];
    setLanguage(next);
    setCode(next.starter);
  }

  async function handleRun() {
    setTab("test");
    setRunning(true);
    setRunResult(null);
    record("ran", language.id, code);
    try {
      setRunResult(await runCode(language.id, code, stdin));
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmit() {
    setTab("submission");
    setSubmitting(true);
    record("submitted", language.id, code);
    try {
      const res = await submitFast(problem.id, code, best, language.id);
      setSubmitResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  function handleRestore(snapshot: Snapshot) {
    const lang = LANGUAGES.find((l) => l.id === snapshot.language) ?? language;
    setLanguage(lang);
    setCode(snapshot.code);
  }

  const isCurrentProblemSubmitting =
    submitting ||
    Boolean(
      activeSubmission &&
        (activeSubmission.problemId === problem.id ||
          activeSubmission.problemId === problem.slug ||
          activeSubmission.id === submitResult?.submissionId)
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <Select value={language.id} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-36" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.id} value={lang.id}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="size-4" />
          History
        </Button>
      </div>

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="62" minSize="30">
          <div className="h-full">
            <CodeEditor language={language.monaco} value={code} onChange={setCode} />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="38" minSize="20">
          <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col gap-0">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="test">Test</TabsTrigger>
                <TabsTrigger value="submission">Submission</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground lg:inline">
                  Run uses your input · Submit runs hidden tests
                </span>
                <Button variant="secondary" size="sm" onClick={handleRun} disabled={running}>
                  <Play className="size-4" />
                  {running ? "Running…" : "Run"}
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                  <Send className="size-4" />
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              </div>
            </div>

            <TabsContent value="test" className="flex min-h-0 flex-1 flex-col">
              <IoPanels
                stdin={stdin}
                onStdinChange={setStdin}
                result={runResult}
                running={running}
              />
            </TabsContent>

            <TabsContent value="submission" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SubmissionResult
                result={submitResult}
                submitting={Boolean(isCurrentProblemSubmitting)}
                statusMessage={
                  activeSubmission
                    ? activeSubmission.status === "queued"
                      ? `Queued (Position #${activeSubmission.queuePosition ?? 1} in line)...`
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
