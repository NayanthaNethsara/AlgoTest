"use client";

import { useState } from "react";
import { Check, Copy, History, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SNAPSHOT_TRIGGER_LABELS } from "@/lib/constants";
import type { HistoryFilter, Snapshot } from "@/types/history";

type HistoryPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: Snapshot[];
  onRestore: (snapshot: Snapshot) => void;
};

export function HistoryPanel({
  open,
  onOpenChange,
  snapshots,
  onRestore,
}: HistoryPanelProps) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filteredSnapshots = snapshots.filter((s) => {
    if (filter === "all") return true;
    return s.trigger === filter;
  });

  const selected =
    filteredSnapshots.find((s) => s.id === selectedId) ??
    filteredSnapshots[0] ??
    null;

  const countSubmitted = snapshots.filter(
    (s) => s.trigger === "submitted",
  ).length;
  const countAutosave = snapshots.filter(
    (s) => s.trigger === "autosave",
  ).length;
  const countRan = snapshots.filter((s) => s.trigger === "ran").length;

  const handleCopy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeLines = selected ? selected.code.split("\n") : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:w-[85vw] sm:max-w-[1200px] 2xl:max-w-[1400px]"
      >
        <SheetHeader className="border-b-2 border-border px-5 py-3.5 bg-card">
          <div className="flex items-center gap-2.5">
            <History className="h-4.5 w-4.5 text-primary" />
            <SheetTitle className="text-base font-bold text-foreground">
              Version History
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Browse and restore previous snapshots saved during runs, submissions,
            and autosaves.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 border-b-2 border-border bg-muted/40 px-4 py-2 text-xs">
          <Button
            variant={filter === "all" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setFilter("all")}
          >
            All ({snapshots.length})
          </Button>
          <Button
            variant={filter === "submitted" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setFilter("submitted")}
          >
            Submissions ({countSubmitted})
          </Button>
          <Button
            variant={filter === "autosave" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setFilter("autosave")}
          >
            Autosaves ({countAutosave})
          </Button>
          <Button
            variant={filter === "ran" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setFilter("ran")}
          >
            Runs ({countRan})
          </Button>
        </div>

        {filteredSnapshots.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
            <History className="h-10 w-10 text-muted-foreground mb-3" />
            <span className="font-semibold text-sm text-foreground">
              No snapshots found
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              Snapshots will appear as you edit, run, and submit code.
            </span>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] lg:grid-cols-[360px_1fr]">
            {/* Snapshot List Left Pane */}
            <ScrollArea className="border-r-2 border-border bg-card">
              <ol className="flex flex-col gap-1.5 p-3">
                {filteredSnapshots.map((snapshot) => {
                  const isSelected = selected?.id === snapshot.id;
                  return (
                    <li key={snapshot.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(snapshot.id)}
                        className={`flex w-full flex-col gap-2 p-3 text-left transition-colors border-2 ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-[inset_2px_2px_0_var(--bevel-light),inset_-2px_-2px_0_var(--bevel-dark)]"
                            : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className="text-[10px] uppercase font-semibold px-1.5 py-0.2"
                            >
                              {SNAPSHOT_TRIGGER_LABELS[snapshot.trigger]}
                            </Badge>
                            {snapshot.verdict && (
                              <Badge
                                variant={
                                  snapshot.verdict === "AC"
                                    ? "success"
                                    : "destructive"
                                }
                                className="text-[10px] py-0 px-1 font-semibold"
                              >
                                {snapshot.verdict}
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {relativeTime(snapshot.at)}
                          </span>
                        </div>

                        {typeof snapshot.score === "number" && (
                          <div className="text-xs font-mono font-semibold text-amber-400">
                            Score: {snapshot.score}/{snapshot.maxScore ?? 100} XP
                          </div>
                        )}

                        <pre className="line-clamp-2 overflow-hidden font-mono text-[11px] text-muted-foreground bg-background/80 p-1.5 border border-border/40">
                          {snapshot.code.trim() || "(empty)"}
                        </pre>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>

            {/* Selected Snapshot Preview Right Pane */}
            {selected && (
              <div className="flex min-h-0 flex-col bg-background">
                <div className="flex items-center justify-between gap-3 border-b-2 border-border bg-card px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {selected.language}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(selected.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {codeLines.length} lines
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2.5 gap-1.5"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <>
                          <Check className="size-3.5 text-success" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        onRestore(selected);
                        onOpenChange(false);
                      }}
                      className="h-7 text-xs px-3 gap-1.5"
                    >
                      <RotateCcw className="size-3.5" />
                      Restore
                    </Button>
                  </div>
                </div>

                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-4 font-mono text-xs leading-relaxed">
                    <table className="w-full border-collapse">
                      <tbody>
                        {codeLines.map((line, idx) => (
                          <tr key={idx} className="hover:bg-muted/20">
                            <td className="select-none pr-4 text-right text-muted-foreground/60 w-8 text-[11px] align-top">
                              {idx + 1}
                            </td>
                            <td className="whitespace-pre-wrap text-foreground break-all">
                              {line || " "}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function relativeTime(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
