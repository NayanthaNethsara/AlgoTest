"use client";

import { Textarea } from "@/components/ui/textarea";
import type { RunResult } from "@/types/code";

type IoPanelsProps = {
  stdin: string;
  onStdinChange: (value: string) => void;
  result: RunResult | null;
  running: boolean;
};

export function IoPanels({
  stdin,
  onStdinChange,
  result,
  running,
}: IoPanelsProps) {
  return (
    <div className="grid min-h-0 flex-1 gap-px overflow-hidden bg-border sm:grid-cols-2">
      <div className="flex min-h-0 flex-col bg-background">
        <PanelLabel>
          <span>Custom input (stdin)</span>
          {stdin && (
            <button
              type="button"
              onClick={() => onStdinChange("")}
              className="text-[10px] text-muted-foreground hover:text-foreground font-normal transition-colors"
            >
              Clear
            </button>
          )}
        </PanelLabel>
        <Textarea
          value={stdin}
          onChange={(e) => onStdinChange(e.target.value)}
          placeholder="Type test input here..."
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0 bg-input"
        />
      </div>

      <div className="flex min-h-0 flex-col bg-background">
        <PanelLabel>
          <span>Output</span>
          {result && (
            <span className="flex items-center gap-3 text-[11px] font-normal normal-case">
              {result.verdict && (
                <span
                  className={
                    result.verdict === "AC"
                      ? "font-semibold text-success"
                      : result.verdict === "TLE" ||
                          result.verdict === "MLE" ||
                          result.verdict === "SK"
                        ? "font-semibold text-warning"
                        : "font-semibold text-destructive"
                  }
                >
                  {result.verdict}
                </span>
              )}
              <span>{result.timeMs} ms</span>
              {typeof result.memoryKb === "number" && result.memoryKb > 0 && (
                <span>{(result.memoryKb / 1024).toFixed(1)} MB</span>
              )}
              <span
                className={
                  result.exitCode === 0
                    ? "text-muted-foreground"
                    : "text-destructive"
                }
              >
                exit {result.exitCode}
              </span>
            </span>
          )}
        </PanelLabel>
        <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs bg-background">
          <OutputBody result={result} running={running} />
        </div>
      </div>
    </div>
  );
}

function OutputBody({
  result,
  running,
}: {
  result: RunResult | null;
  running: boolean;
}) {
  if (running)
    return (
      <span className="text-muted-foreground text-xs">Running code...</span>
    );
  if (!result)
    return (
      <span className="text-muted-foreground text-xs">
        Click Run to execute your test input.
      </span>
    );

  const hasOutput = Boolean(
    result.stdout || result.stderr || result.compileError,
  );

  return (
    <div className="flex flex-col gap-3 font-mono text-xs">
      {result.compileError && (
        <div className="badge-destructive border p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide">
            Compilation error
          </div>
          <pre className="whitespace-pre-wrap">{result.compileError}</pre>
        </div>
      )}
      {result.stdout && (
        <pre className="whitespace-pre-wrap text-foreground">
          {result.stdout}
        </pre>
      )}
      {result.stderr && !result.compileError && (
        <div className="badge-destructive border p-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide">
            {result.verdict === "TLE"
              ? "Time limit exceeded"
              : result.verdict === "MLE"
                ? "Memory limit exceeded"
                : result.verdict === "OLE"
                  ? "Output limit exceeded"
                  : "Stderr output"}
          </div>
          <pre className="whitespace-pre-wrap">{result.stderr}</pre>
        </div>
      )}
      {!hasOutput && (
        <span className="text-muted-foreground italic text-xs">
          (Program produced no output)
        </span>
      )}
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b-2 border-border bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
      {children}
    </div>
  );
}
