"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { getAdminProctorTimelineAction } from "@/actions/telemetry";
import { formatClock } from "@/lib/monitoring";
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
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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

      <p className="text-xs text-muted-foreground">
        Newest first: what the proctor client saw them open, when it connected and went dark, every
        finding it raised, and every submission. All of it is evidence for a human to weigh —
        nothing on this page disqualifies anyone by itself.
      </p>

      <ol className="relative flex flex-col gap-0 border-l border-border pl-6">
        {timeline?.entries.map((entry, index) => (
          <TimelineRow key={`${entry.kind}-${entry.at}-${index}`} entry={entry} />
        ))}
        {timeline?.entries.length === 0 && (
          <li className="py-8 text-sm text-muted-foreground">
            No telemetry, findings or submissions recorded for this contestant yet.
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

  if (entry.kind === "gap") {
    return (
      <li className="relative mb-6 ml-2">
        <span className="absolute -left-[31px] top-1.5 size-3 rounded-full bg-destructive ring-4 ring-background" />
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs">
          <div className="flex items-center justify-between font-semibold text-destructive">
            <span>{entry.label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{atTime}</span>
          </div>
          {entry.detail && <p className="mt-1 text-muted-foreground">{entry.detail}</p>}
        </div>
      </li>
    );
  }

  if (entry.kind === "finding") {
    return (
      <li className="relative mb-6 ml-2">
        <span className="absolute -left-[31px] top-1.5 size-3 rounded-full bg-warning ring-4 ring-background" />
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs">
          <div className="flex items-center justify-between font-semibold text-warning">
            <span>{entry.label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{atTime}</span>
          </div>
          {entry.detail && (
            <p className="mt-1 text-muted-foreground font-mono text-[11px]">{entry.detail}</p>
          )}
          {entry.payload && (
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
        <span className="absolute -left-[31px] top-1.5 size-3 rounded-full bg-primary ring-4 ring-background" />
        <div className="rounded-lg border border-border bg-card p-4 text-xs">
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span>{entry.label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{atTime}</span>
          </div>
          {entry.detail && <p className="mt-1 text-muted-foreground">{entry.detail}</p>}
        </div>
      </li>
    );
  }

  // Events and enrollments. The label is already the readable sentence the server
  // derived from the raw signal set; the raw set stays one click away, because a
  // reviewer arguing with a contestant needs the bundle identifier, not "Chrome".
  return (
    <li className="relative mb-6 ml-2">
      <span className="absolute -left-[31px] top-1.5 size-2 rounded-full bg-muted-foreground ring-4 ring-background" />
      <div className="text-xs">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] text-muted-foreground shrink-0">{atTime}</span>
          <span className="font-medium text-foreground">{entry.label}</span>
        </div>
        {entry.detail && (
          <p className="ml-[62px] text-[11px] text-muted-foreground">{entry.detail}</p>
        )}
        {entry.payload && (
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
