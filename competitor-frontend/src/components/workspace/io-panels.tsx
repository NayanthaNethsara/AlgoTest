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
    <div className="grid min-h-0 flex-1 gap-px overflow-hidden bg-black sm:grid-cols-2">
      <div className="flex min-h-0 flex-col bg-background">
        <PanelLabel>CUSTOM INPUT (STDIN)</PanelLabel>
        <Textarea
          value={stdin}
          onChange={(e) => onStdinChange(e.target.value)}
          placeholder="TYPE TEST INPUT HERE..."
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0 bg-input"
        />
      </div>

      <div className="flex min-h-0 flex-col bg-background">
        <PanelLabel>
          <span>OUTPUT</span>
          {result && (
            <span className="flex items-center gap-3 font-pixel-body text-[10px]">
              {result.verdict && (
                <span
                  className={
                    result.verdict === "AC"
                      ? "font-bold text-emerald-400"
                      : "font-bold text-rose-400"
                  }
                >
                  {result.verdict}
                </span>
              )}
              <span>{result.timeMs} ms</span>
              {typeof result.memoryKb === "number" && result.memoryKb > 0 && (
                <span>{(result.memoryKb / 1024).toFixed(1)} MB</span>
              )}
              <span className={result.exitCode === 0 ? "text-muted-foreground" : "text-rose-400"}>
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

function OutputBody({ result, running }: { result: RunResult | null; running: boolean }) {
  if (running) return <span className="text-muted-foreground font-pixel-body text-xs">RUNNING CODE...</span>;
  if (!result) return <span className="text-muted-foreground font-pixel-body text-xs">CLICK RUN TO EXECUTE TEST INPUT.</span>;

  return (
    <div className="flex flex-col gap-3 font-mono text-xs">
      {result.compileError && (
        <div className="border-2 border-black bg-rose-950 p-2.5 shadow-[inset_1px_1px_0px_#000000]">
          <div className="mb-1 text-[10px] font-pixel-body font-bold uppercase text-rose-400">
            COMPILATION ERROR
          </div>
          <pre className="whitespace-pre-wrap text-rose-300">{result.compileError}</pre>
        </div>
      )}
      {result.stdout && <pre className="whitespace-pre-wrap text-foreground">{result.stdout}</pre>}
      {result.stderr && !result.compileError && (
        <div className="border-2 border-black bg-rose-950 p-2.5 shadow-[inset_1px_1px_0px_#000000]">
          <div className="mb-1 text-[10px] font-pixel-body font-bold uppercase text-rose-400">
            STDERR OUTPUT
          </div>
          <pre className="whitespace-pre-wrap text-rose-300">{result.stderr}</pre>
        </div>
      )}
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b-2 border-black bg-muted px-3 py-1.5 text-[10px] font-pixel-body font-bold uppercase tracking-wider text-foreground">
      {children}
    </div>
  );
}
