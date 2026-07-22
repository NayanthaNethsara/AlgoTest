"use client";

import { Textarea } from "@/components/ui/textarea";
import type { RunResult } from "@/types/code";

type IoPanelsProps = {
  stdin: string;
  onStdinChange: (value: string) => void;
  result: RunResult | null;
  running: boolean;
};

export function IoPanels({ stdin, onStdinChange, result, running }: IoPanelsProps) {
  return (
    <div className="grid min-h-0 flex-1 gap-px overflow-hidden bg-border sm:grid-cols-2">
      <div className="flex min-h-0 flex-col bg-background">
        <PanelLabel>Custom input (stdin)</PanelLabel>
        <Textarea
          value={stdin}
          onChange={(e) => onStdinChange(e.target.value)}
          placeholder="Type your own test input…"
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="flex min-h-0 flex-col bg-background">
        <PanelLabel>
          <span>Output</span>
          {result && (
            <span className="flex items-center gap-3 font-normal normal-case tracking-normal">
              <span>{result.timeMs} ms</span>
              <span className={result.exitCode === 0 ? "text-success" : "text-destructive"}>
                exit {result.exitCode}
              </span>
            </span>
          )}
        </PanelLabel>
        <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">
          <OutputBody result={result} running={running} />
        </div>
      </div>
    </div>
  );
}

function OutputBody({ result, running }: { result: RunResult | null; running: boolean }) {
  if (running) return <span className="text-muted-foreground">Running…</span>;
  if (!result) return <span className="text-muted-foreground">Run to see output.</span>;

  return (
    <div className="flex flex-col gap-3">
      {result.stdout && <pre className="whitespace-pre-wrap">{result.stdout}</pre>}
      {result.stderr && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-destructive">
            stderr
          </div>
          <pre className="whitespace-pre-wrap text-destructive">{result.stderr}</pre>
        </div>
      )}
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}
