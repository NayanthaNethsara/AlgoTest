"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { getAdminProctorTimelineAction } from "@/actions/telemetry";
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

  return (
    <div className="flex flex-col gap-6 p-8 max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/monitoring"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
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
        Newest first. Everything here is evidence for a human to weigh — nothing on this page
        disqualifies anyone by itself.
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
    </div>
  );
}

/**
 * One row on the axis. The kind decides the marker and whether it carries colour:
 * blackouts and findings are what an organizer is scanning for, so routine
 * telemetry and submissions stay quiet.
 */
function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const { marker, tone, title, body } = describe(entry);

  return (
    <li className="relative py-2.5">
      <span
        className={`absolute -left-[1.9rem] top-3.5 size-2.5 rounded-full ring-4 ring-background ${
          tone === "destructive"
            ? "bg-destructive"
            : tone === "warning"
              ? "bg-warning"
              : tone === "primary"
                ? "bg-primary"
                : "bg-muted-foreground/40"
        }`}
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatClock(entry.at)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {marker}
        </span>
        <span
          className={`text-xs font-semibold ${
            tone === "destructive"
              ? "text-destructive"
              : tone === "warning"
                ? "text-warning"
                : "text-foreground"
          }`}
        >
          {title}
        </span>
      </div>
      {body && <p className="mt-0.5 text-[11px] text-muted-foreground">{body}</p>}
    </li>
  );
}

function describe(entry: TimelineEntry): {
  marker: string;
  tone: "neutral" | "warning" | "destructive" | "primary";
  title: string;
  body: string;
} {
  switch (entry.kind) {
    case "gap": {
      const open = !entry.endedAt;
      return {
        marker: "blackout",
        tone: "destructive",
        title: open
          ? "Telemetry blackout — still open"
          : `Telemetry blackout — ${formatDuration(entry.count ?? 0)}`,
        body: open
          ? `Started ${formatClock(entry.at)}, no reports since. Reason recorded: ${entry.label}.`
          : `${formatClock(entry.at)} → ${formatClock(entry.endedAt)}. Reason recorded: ${entry.label}.`,
      };
    }

    case "finding":
      return {
        marker: "finding",
        tone: (entry.weight ?? 0) >= 30 ? "destructive" : "warning",
        title: entry.detail || entry.label,
        body: [
          `Rule ${entry.label}`,
          `weight ${entry.weight ?? 0}`,
          entry.count && entry.count > 1 ? `seen ${entry.count}×` : null,
          summarise(entry.payload),
        ]
          .filter(Boolean)
          .join(" · "),
      };

    case "submission":
      return {
        marker: "submission",
        tone: "primary",
        title: `Submitted ${entry.label}`,
        body: [
          `verdict ${entry.detail || "pending"}`,
          `score ${entry.weight ?? 0}`,
          provenance(entry.payload),
        ]
          .filter(Boolean)
          .join(" · "),
      };

    case "enrollment":
      return {
        marker: "enrolment",
        tone: entry.detail?.startsWith("revoked") ? "warning" : "neutral",
        title: `Agent enrolled on ${entry.label || "unknown platform"}`,
        body: [entry.detail, summarise(entry.payload)].filter(Boolean).join(" · "),
      };

    default: {
      const signals = signalSummary(entry.payload);
      return {
        marker: entry.label === "buffered" ? "replayed" : entry.label.replace("_", " "),
        tone: signals.alarming ? "warning" : "neutral",
        title: signals.text || "No notable signals",
        body:
          entry.label === "buffered"
            ? "Held by the agent while it could not reach the server, replayed at its original time."
            : "",
      };
    }
  }
}

/** Renders the signal payload as the sentence an organizer would say out loud. */
function signalSummary(payload?: Record<string, unknown>): { text: string; alarming: boolean } {
  if (!payload) return { text: "", alarming: false };

  const parts: string[] = [];
  let alarming = false;

  if (payload.internet_reachable === true) {
    parts.push("internet reachable");
    alarming = true;
  }

  const ports = Array.isArray(payload.ports) ? payload.ports : [];
  const confirmed = ports.filter(
    (port): port is { product?: string; port?: number } =>
      typeof port === "object" &&
      port !== null &&
      (port as { confirmed?: boolean }).confirmed === true
  );
  if (confirmed.length > 0) {
    parts.push(confirmed.map((p) => `${p.product ?? "LLM"} on ${p.port}`).join(", "));
    alarming = true;
  }

  const matches = Array.isArray(payload.process_matches) ? payload.process_matches : [];
  if (matches.length > 0) {
    parts.push(`processes: ${matches.join(", ")}`);
    alarming = true;
  }

  if (typeof payload.foreground_app === "string" && payload.foreground_app) {
    parts.push(`focus ${payload.foreground_app}`);
  }

  return { text: parts.join(" · "), alarming };
}

function provenance(payload?: Record<string, unknown>): string {
  if (!payload) return "";
  const typed = Number(payload.typed_chars ?? 0);
  const pasted = Number(payload.pasted_chars ?? 0);
  const bulk = Number(payload.bulk_inserted_chars ?? 0);
  if (typed + pasted + bulk === 0) return "no editor statistics";
  return `${typed} typed · ${pasted} pasted · ${bulk} bulk-inserted`;
}

function summarise(payload?: Record<string, unknown>): string {
  if (!payload) return "";
  return Object.entries(payload)
    .filter(([, value]) => value !== null && value !== "" && value !== false)
    .slice(0, 4)
    .map(([key, value]) => `${key.replace(/_/g, " ")} ${formatValue(value)}`)
    .join(" · ");
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function SeverityPill({ severity, score }: { severity: string; score: number }) {
  const toneClass =
    severity === "HIGH"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : severity === "MEDIUM"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-border text-muted-foreground";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>
      Risk {score} · {severity}
    </span>
  );
}
