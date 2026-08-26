"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import { getAdminProctorTimelineAction } from "@/lib/actions/monitoring";
import { formatClock, formatDuration } from "@/lib/monitoring";
import type { ProctorTimeline, TimelineEntry } from "@/types/proctor";

export default function ContestantTimelinePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [timeline, setTimeline] = useState<ProctorTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await getAdminProctorTimelineAction(userId);
      setError(result.error ?? null);
      if (result.timeline) setTimeline(result.timeline);
    });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const [filter, setFilter] = useState<"ALL" | "GAPS" | "FINDINGS" | "SUBMISSIONS" | "APPS">("ALL");

  const entries = timeline?.entries ?? [];

  const disconnectEvents = entries.filter((e) => {
    const text = `${e.label} ${e.detail ?? ""}`.toLowerCase();
    return (
      e.kind === "gap" ||
      text.includes("disconnected") ||
      text.includes("no longer reachable") ||
      text.includes("agent_stopped") ||
      text.includes("stopped deliberately") ||
      text.includes("blackout") ||
      text.includes("unreachable")
    );
  });

  const filteredEntries = entries.filter((e) => {
    if (filter === "ALL") return true;
    const text = `${e.label} ${e.detail ?? ""}`.toLowerCase();
    const isDisc =
      e.kind === "gap" ||
      text.includes("disconnected") ||
      text.includes("no longer reachable") ||
      text.includes("agent_stopped") ||
      text.includes("stopped deliberately") ||
      text.includes("blackout") ||
      text.includes("unreachable") ||
      text.includes("reconnected") ||
      text.includes("became reachable") ||
      text.includes("replayed");

    if (filter === "GAPS") return isDisc;
    if (filter === "FINDINGS") return e.kind === "finding";
    if (filter === "SUBMISSIONS") return e.kind === "submission";
    if (filter === "APPS") return e.kind === "event" && !isDisc;
    return true;
  });

  return (
    <main className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/monitoring"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to monitoring
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {timeline?.displayName ?? "Contestant"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {timeline ? (
              <>
                @{timeline.username}
                {timeline.teamName && ` · ${timeline.teamName}`}
                {timeline.supportHint && ` · machine ${timeline.supportHint.slice(0, 12)}`}
              </>
            ) : (
              "Loading evidence…"
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {timeline && <SeverityPill severity={timeline.severity} score={timeline.score} />}
          <button
            onClick={load}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {error}
        </p>
      )}

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 bg-muted/50 p-1 rounded-lg border border-border">
          {(
            [
              { id: "ALL", label: `All Events (${entries.length})` },
              { id: "GAPS", label: `Disconnects & Gaps (${disconnectEvents.length})` },
              { id: "FINDINGS", label: "Rule Findings" },
              { id: "SUBMISSIONS", label: "Submissions" },
              { id: "APPS", label: "App Switches" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                filter === t.id
                  ? t.id === "GAPS" && disconnectEvents.length > 0
                    ? "bg-destructive text-destructive-foreground shadow-sm"
                    : "bg-background text-foreground shadow-sm"
                  : t.id === "GAPS" && disconnectEvents.length > 0
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <span className="text-muted-foreground text-[11px]">
          Showing {filteredEntries.length} of {entries.length} records
        </span>
      </div>

      <ol className="relative flex flex-col gap-0 border-l-2 border-border pl-6">
        {filteredEntries.map((entry, index) => (
          <TimelineRow key={`${entry.kind}-${entry.at}-${index}`} entry={entry} />
        ))}
        {filteredEntries.length === 0 && (
          <li className="py-8 text-sm text-muted-foreground">
            No events match the selected filter.
          </li>
        )}
      </ol>
    </main>
  );
}

function SeverityPill({ severity, score }: { severity: "HIGH" | "MEDIUM" | "LOW"; score: number }) {
  const styles = {
    HIGH: "bg-destructive/15 border-destructive/40 text-destructive",
    MEDIUM: "bg-amber-500/15 border-amber-500/40 text-amber-400",
    LOW: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
  };
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${styles[severity]}`}>
      {severity} ({score})
    </span>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const atTime = formatClock(entry.at);
  const text = `${entry.label} ${entry.detail ?? ""}`.toLowerCase();

  const isGap = entry.kind === "gap";
  const isDisconnect =
    isGap ||
    text.includes("disconnected") ||
    text.includes("no longer reachable") ||
    text.includes("agent_stopped") ||
    text.includes("stopped deliberately") ||
    text.includes("blackout") ||
    text.includes("unreachable");

  const isReconnect =
    !isDisconnect &&
    (text.includes("reconnected") ||
      text.includes("became reachable") ||
      text.includes("back online") ||
      text.includes("buffered heartbeats replayed") ||
      text.includes("flushed"));

  if (isDisconnect) {
    const isGapEntry = entry.kind === "gap";
    return (
      <li className="relative mb-6 ml-2">
        <span className="absolute -left-[33px] top-1.5 size-3.5 rounded-full bg-destructive ring-4 ring-destructive/25 animate-pulse" />
        <div className="rounded-lg border-2 border-destructive/60 bg-destructive/15 p-4 text-xs shadow-sm space-y-2">
          <div className="flex items-center justify-between font-bold text-destructive">
            <div className="flex items-center gap-2">
              <WifiOff className="size-4 shrink-0 text-destructive animate-pulse" />
              <span className="text-sm tracking-tight">{entry.label}</span>
            </div>
            <span className="font-mono text-[11px] text-destructive/90">{atTime}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {isGapEntry && typeof entry.count === "number" && entry.count > 0 && (
              <span className="inline-flex items-center rounded bg-destructive/20 border border-destructive/40 px-2 py-0.5 font-bold text-destructive">
                Gap Duration: {formatDuration(entry.count)}
              </span>
            )}
            {entry.endedAt && (
              <span className="inline-flex items-center rounded bg-muted/60 border border-border px-2 py-0.5 font-mono text-muted-foreground">
                Reconnected at {formatClock(entry.endedAt)}
              </span>
            )}
          </div>

          {entry.detail && (
            <p className="font-semibold text-destructive/90 leading-relaxed">
              {entry.detail}
            </p>
          )}

          {entry.payload && Object.keys(entry.payload).length > 0 && (
            <pre className="mt-2 p-2 rounded bg-black/50 text-[10px] text-destructive-foreground font-mono overflow-x-auto">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          )}
        </div>
      </li>
    );
  }

  if (isReconnect) {
    return (
      <li className="relative mb-6 ml-2">
        <span className="absolute -left-[33px] top-1.5 size-3.5 rounded-full bg-amber-500 ring-4 ring-amber-500/25" />
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-xs shadow-sm">
          <div className="flex items-center justify-between font-semibold text-amber-400">
            <div className="flex items-center gap-2">
              <RotateCw className="size-4 shrink-0 text-amber-400" />
              <span>{entry.label}</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">{atTime}</span>
          </div>
          {entry.detail && (
            <p className="mt-1 font-medium text-amber-300/90 leading-relaxed">
              {entry.detail}
            </p>
          )}
        </div>
      </li>
    );
  }

  if (entry.kind === "finding") {
    return (
      <li className="relative mb-6 ml-2">
        <span className="absolute -left-[33px] top-1.5 size-3.5 rounded-full bg-warning ring-4 ring-background" />
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-xs">
          <div className="flex items-center justify-between font-semibold text-warning">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 shrink-0 text-warning" />
              <span>{entry.label}</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">{atTime}</span>
          </div>
          {entry.detail && (
            <p className="mt-1 text-muted-foreground font-mono text-[11px]">{entry.detail}</p>
          )}
          {entry.payload && Object.keys(entry.payload).length > 0 && (
            <pre className="mt-2 p-2 rounded bg-black/40 text-[10px] text-foreground font-mono overflow-x-auto">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          )}
        </div>
      </li>
    );
  }

  if (entry.kind === "submission") {
    return (
      <li className="relative mb-6 ml-2">
        <span className="absolute -left-[33px] top-1.5 size-3 rounded-full bg-primary ring-4 ring-background" />
        <div className="rounded-lg border border-border bg-card p-4 text-xs">
          <div className="flex items-center justify-between font-semibold text-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-primary" />
              <span>Submission: {entry.label}</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">{atTime}</span>
          </div>
          {entry.detail && <p className="mt-1 text-muted-foreground">{entry.detail}</p>}
        </div>
      </li>
    );
  }

  return (
    <li className="relative mb-6 ml-2">
      <span className="absolute -left-[32px] top-1.5 size-2.5 rounded-full bg-muted-foreground ring-4 ring-background" />
      <div className="text-xs">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] text-muted-foreground shrink-0">{atTime}</span>
          <span className="font-medium text-foreground">{entry.label}</span>
        </div>
        {entry.detail && (
          <p className="ml-[62px] text-[11px] text-muted-foreground">{entry.detail}</p>
        )}
        {entry.payload && Object.keys(entry.payload).length > 0 && (
          <details className="ml-[62px] mt-1">
            <summary className="cursor-pointer text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
              Raw signals
            </summary>
            <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 font-mono text-[10px] text-foreground">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </li>
  );
}
