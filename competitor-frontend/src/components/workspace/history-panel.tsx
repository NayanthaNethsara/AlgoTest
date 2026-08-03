"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
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
import type { Snapshot, SnapshotTrigger } from "@/types/history";

const TRIGGER_LABELS: Record<SnapshotTrigger, string> = {
  autosave: "Autosave",
  ran: "Ran",
  submitted: "Submitted",
};

type HistoryFilter = "all" | "submitted" | "autosave" | "ran";

type HistoryPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: Snapshot[];
  onRestore: (snapshot: Snapshot) => void;
};

export function HistoryPanel({ open, onOpenChange, snapshots, onRestore }: HistoryPanelProps) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredSnapshots = snapshots.filter((s) => {
    if (filter === "all") return true;
    return s.trigger === filter;
  });

  const selected =
    filteredSnapshots.find((s) => s.id === selectedId) ?? filteredSnapshots[0] ?? null;

  const countSubmitted = snapshots.filter((s) => s.trigger === "submitted").length;
  const countAutosave = snapshots.filter((s) => s.trigger === "autosave").length;
  const countRan = snapshots.filter((s) => s.trigger === "ran").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>Snapshots saved as you work on this problem.</SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-2 text-xs">
          <Button
            variant={filter === "all" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setFilter("all")}
          >
            All ({snapshots.length})
          </Button>
          <Button
            variant={filter === "submitted" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setFilter("submitted")}
          >
            Submissions ({countSubmitted})
          </Button>
          <Button
            variant={filter === "autosave" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setFilter("autosave")}
          >
            Autosaves ({countAutosave})
          </Button>
          <Button
            variant={filter === "ran" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setFilter("ran")}
          >
            Runs ({countRan})
          </Button>
        </div>

        {filteredSnapshots.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No snapshots found for this category.</div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <ScrollArea className="border-r">
              <ol className="flex flex-col p-2">
                {filteredSnapshots.map((snapshot) => (
                  <li key={snapshot.id}>
                    <button
                      onClick={() => setSelectedId(snapshot.id)}
                      className={`flex w-full flex-col gap-1.5 rounded-md p-3 text-left transition-colors ${
                        selected?.id === snapshot.id ? "bg-accent" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary">{TRIGGER_LABELS[snapshot.trigger]}</Badge>
                          {snapshot.verdict && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] py-0 px-1 font-semibold ${
                                snapshot.verdict === "AC"
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                              }`}
                            >
                              {snapshot.verdict}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(snapshot.at)}
                        </span>
                      </div>
                      {typeof snapshot.score === "number" && (
                        <div className="text-[11px] font-mono text-muted-foreground">
                          Score: {snapshot.score}/{snapshot.maxScore ?? 100} pts
                        </div>
                      )}
                      <pre className="line-clamp-2 overflow-hidden font-mono text-[11px] text-muted-foreground">
                        {snapshot.code.trim() || "(empty)"}
                      </pre>
                    </button>
                  </li>
                ))}
              </ol>
            </ScrollArea>

            {selected && (
              <div className="flex min-h-0 flex-col">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">
                    {selected.language} · {new Date(selected.at).toLocaleString()}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onRestore(selected);
                      onOpenChange(false);
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    Restore
                  </Button>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <pre className="p-4 font-mono text-xs leading-relaxed">{selected.code}</pre>
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
