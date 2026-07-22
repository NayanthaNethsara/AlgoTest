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
import type { Snapshot, SnapshotTrigger } from "@/lib/use-history";

const TRIGGER_LABELS: Record<SnapshotTrigger, string> = {
  autosave: "Autosave",
  ran: "Ran",
  submitted: "Submitted",
};

type HistoryPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: Snapshot[];
  onRestore: (snapshot: Snapshot) => void;
};

export function HistoryPanel({ open, onOpenChange, snapshots, onRestore }: HistoryPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = snapshots.find((s) => s.id === selectedId) ?? snapshots[0] ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>Snapshots saved as you work on this problem.</SheetDescription>
        </SheetHeader>

        {snapshots.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No snapshots yet.</div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <ScrollArea className="border-r">
              <ol className="flex flex-col p-2">
                {snapshots.map((snapshot) => (
                  <li key={snapshot.id}>
                    <button
                      onClick={() => setSelectedId(snapshot.id)}
                      className={`flex w-full flex-col gap-1.5 rounded-md p-3 text-left transition-colors ${
                        selected?.id === snapshot.id ? "bg-accent" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">{TRIGGER_LABELS[snapshot.trigger]}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(snapshot.at)}
                        </span>
                      </div>
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
