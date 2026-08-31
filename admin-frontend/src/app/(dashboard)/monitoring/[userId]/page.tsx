"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  AppWindow,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { getAdminProctorTimelineAction } from "@/lib/actions/monitoring";
import { formatAppName, formatClock, formatDuration } from "@/lib/monitoring";
import { EvidenceCard } from "@/components/monitoring/evidence-card";
import type { EvidenceFinding, ProctorTimeline, TimelineEntry } from "@/types/proctor";

type FindingDetail = {
  ruleId: string;
  title: string;
  weight: number;
  evidence?: any;
};

type ConsolidatedSnapshot = {
  id: string;
  timestamp: string;
  timeFormatted: string;
  endedAt?: string | null;
  kind: "gap" | "submission" | "violation" | "activity";
  primaryTitle: string;
  details: string[];
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NORMAL";
  foregroundApp?: string;
  processMatches: string[];
  totalProcesses?: number;
  lanIp?: string;
  internetReachable?: boolean;
  gapDuration?: number;
  findings: FindingDetail[];
  submission?: {
    problemTitle: string;
    verdict: string;
    score: number;
    language?: string;
    maxScore?: number;
  };
  rawSignals?: Record<string, any>;
};

function groupTimelineEntries(entries: TimelineEntry[]): ConsolidatedSnapshot[] {
  const snapshots: ConsolidatedSnapshot[] = [];

  for (const entry of entries) {
    const entryTime = new Date(entry.at).getTime();

    // Cluster entries within 4 seconds of each other into the same heartbeat state
    let snapshot = snapshots.find(
      (s) => Math.abs(new Date(s.timestamp).getTime() - entryTime) <= 4000
    );

    if (!snapshot) {
      snapshot = {
        id: `${entry.at}-${snapshots.length}`,
        timestamp: entry.at,
        timeFormatted: formatClock(entry.at),
        endedAt: entry.endedAt,
        kind: "activity",
        primaryTitle: entry.label,
        details: [],
        severity: "NORMAL",
        processMatches: [],
        findings: [],
      };
      snapshots.push(snapshot);
    }

    if (entry.kind === "gap") {
      snapshot.kind = "gap";
      snapshot.severity = "CRITICAL";
      snapshot.primaryTitle = entry.label || "Blackout / Disconnection Gap";
      snapshot.gapDuration = typeof entry.count === "number" ? entry.count : 0;
      snapshot.endedAt = entry.endedAt;
      if (entry.detail) snapshot.details.push(entry.detail);
    } else if (entry.kind === "submission") {
      snapshot.kind = "submission";
      snapshot.primaryTitle = `Submission: ${entry.label}`;
      snapshot.submission = {
        problemTitle: entry.label,
        verdict: entry.detail || "Evaluating",
        score: entry.weight ?? 0,
        language: (entry.payload as any)?.language,
        maxScore: (entry.payload as any)?.max_score,
      };
    } else if (entry.kind === "finding") {
      const ruleId = entry.label;
      const title = entry.detail || entry.label;
      const weight = entry.weight ?? entry.count ?? 25;
      snapshot.findings.push({
        ruleId,
        title,
        weight,
        evidence: entry.payload,
      });
      if (snapshot.kind !== "gap" && snapshot.kind !== "submission") {
        snapshot.kind = "violation";
      }
      if (weight >= 30) {
        snapshot.severity = "CRITICAL";
      } else if (weight >= 20 && snapshot.severity !== "CRITICAL") {
        snapshot.severity = "HIGH";
      } else if (snapshot.severity === "NORMAL") {
        snapshot.severity = "MEDIUM";
      }
    } else if (entry.kind === "event") {
      if (entry.label.toLowerCase().startsWith("switched to")) {
        snapshot.primaryTitle = entry.label;
      }
      if (entry.detail && !snapshot.details.includes(entry.detail)) {
        snapshot.details.push(entry.detail);
      }
      if (entry.payload) {
        snapshot.rawSignals = { ...(snapshot.rawSignals || {}), ...entry.payload };
        if (typeof entry.payload.foreground_app === "string" && entry.payload.foreground_app) {
          snapshot.foregroundApp = entry.payload.foreground_app;
        }
        if (Array.isArray(entry.payload.process_matches)) {
          for (const p of entry.payload.process_matches) {
            if (!snapshot.processMatches.includes(String(p))) {
              snapshot.processMatches.push(String(p));
            }
          }
        }
        if (typeof entry.payload.total_processes === "number") {
          snapshot.totalProcesses = entry.payload.total_processes;
        }
        if (typeof entry.payload.lan_ip === "string") {
          snapshot.lanIp = entry.payload.lan_ip;
        }
        if (typeof entry.payload.internet_reachable === "boolean") {
          snapshot.internetReachable = entry.payload.internet_reachable;
        }
      }
    }
  }

  return snapshots.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

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

  const rawEntries = timeline?.entries ?? [];
  const snapshots = groupTimelineEntries(rawEntries);

  const filteredSnapshots = snapshots.filter((s) => {
    if (filter === "ALL") return true;
    if (filter === "GAPS") return s.kind === "gap";
    if (filter === "FINDINGS") return s.findings.length > 0 || s.kind === "violation";
    if (filter === "SUBMISSIONS") return s.kind === "submission";
    if (filter === "APPS") return Boolean(s.foregroundApp) || s.primaryTitle.toLowerCase().includes("switched");
    return true;
  });

  const gapCount = snapshots.filter((s) => s.kind === "gap").length;
  const violationCount = snapshots.filter((s) => s.findings.length > 0).length;
  const submissionCount = snapshots.filter((s) => s.kind === "submission").length;

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
              { id: "ALL", label: `All Moments (${snapshots.length})` },
              { id: "FINDINGS", label: `Violations (${violationCount})` },
              { id: "GAPS", label: `Blackouts & Gaps (${gapCount})` },
              { id: "SUBMISSIONS", label: `Submissions (${submissionCount})` },
              { id: "APPS", label: "App Focus" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                filter === t.id
                  ? t.id === "GAPS" && gapCount > 0
                    ? "bg-destructive text-destructive-foreground shadow-sm"
                    : "bg-background text-foreground shadow-sm"
                  : t.id === "GAPS" && gapCount > 0
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <span className="text-muted-foreground text-[11px]">
          Showing {filteredSnapshots.length} of {snapshots.length} timeline states
        </span>
      </div>

      <ol className="relative flex flex-col gap-0 border-l-2 border-border pl-6">
        {filteredSnapshots.map((snapshot) => (
          <SnapshotBox key={snapshot.id} snapshot={snapshot} />
        ))}
        {filteredSnapshots.length === 0 && (
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

function SnapshotBox({ snapshot }: { snapshot: ConsolidatedSnapshot }) {
  const [showRaw, setShowRaw] = useState(false);

  const getTheme = () => {
    if (snapshot.kind === "gap") {
      return {
        dot: "bg-destructive ring-destructive/30 animate-pulse",
        box: "border-destructive/60 bg-destructive/10",
        badge: "bg-destructive text-destructive-foreground",
        badgeLabel: "BLACKOUT GAP",
      };
    }
    if (snapshot.kind === "submission") {
      return {
        dot: "bg-primary ring-primary/30",
        box: "border-primary/40 bg-card/90",
        badge: "bg-primary/15 text-primary border border-primary/30",
        badgeLabel: "SUBMISSION",
      };
    }
    if (snapshot.findings.length > 0 || snapshot.severity === "CRITICAL" || snapshot.severity === "HIGH") {
      return {
        dot: "bg-amber-500 ring-amber-500/30",
        box: "border-amber-500/50 bg-card/90 shadow-sm",
        badge: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
        badgeLabel: `${snapshot.findings.length} VIOLATION${snapshot.findings.length > 1 ? "S" : ""}`,
      };
    }
    return {
      dot: "bg-muted-foreground ring-background",
      box: "border-border bg-card/60 hover:bg-card/90 transition-colors",
      badge: "bg-muted text-muted-foreground border border-border",
      badgeLabel: "NORMAL ACTIVITY",
    };
  };

  const theme = getTheme();

  return (
    <li className="relative mb-5 ml-2">
      <span className={`absolute -left-[33px] top-3.5 size-3.5 rounded-full ring-4 ${theme.dot}`} />

      <div className={`rounded-lg border ${theme.box} p-4 text-xs space-y-3 shadow-sm`}>
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xs text-foreground">{snapshot.timeFormatted}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${theme.badge}`}>
              {theme.badgeLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {snapshot.rawSignals && Object.keys(snapshot.rawSignals).length > 0 && (
              <button
                type="button"
                onClick={() => setShowRaw((prev) => !prev)}
                className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 px-2 py-0.5 rounded border border-border transition-colors cursor-pointer"
              >
                {showRaw ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                Raw Signals
              </button>
            )}
          </div>
        </div>

        {/* Primary Action / Focus Headline */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-sm text-foreground">
            {snapshot.kind === "gap" ? (
              <WifiOff className="size-4 text-destructive shrink-0" />
            ) : snapshot.kind === "submission" ? (
              <CheckCircle2 className="size-4 text-primary shrink-0" />
            ) : snapshot.findings.length > 0 ? (
              <ShieldAlert className="size-4 text-amber-400 shrink-0" />
            ) : (
              <Activity className="size-4 text-muted-foreground shrink-0" />
            )}
            <span>{snapshot.primaryTitle}</span>
          </div>

          {/* Details / Observations */}
          {snapshot.details.length > 0 && (
            <div className="text-[11px] text-muted-foreground font-medium space-y-0.5">
              {snapshot.details.map((d, idx) => (
                <p key={idx}>{d}</p>
              ))}
            </div>
          )}

          {/* Submission Info */}
          {snapshot.submission && (
            <div className="flex items-center gap-2 pt-1 font-mono text-xs text-foreground">
              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                Verdict: {snapshot.submission.verdict}
              </span>
              <span>Score: {snapshot.submission.score} / {snapshot.submission.maxScore ?? 100}</span>
              {snapshot.submission.language && <span className="text-muted-foreground">({snapshot.submission.language})</span>}
            </div>
          )}

          {/* Gap Duration Info */}
          {snapshot.kind === "gap" && (
            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs text-destructive">
              {snapshot.gapDuration != null && snapshot.gapDuration > 0 && (
                <span className="px-2 py-0.5 rounded bg-destructive/20 border border-destructive/40 font-bold">
                  Blackout Duration: {formatDuration(snapshot.gapDuration)}
                </span>
              )}
              {snapshot.endedAt && (
                <span className="text-muted-foreground">
                  Reconnected at {formatClock(snapshot.endedAt)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Active Context Chips: Focus App & Matched Processes */}
        {(snapshot.foregroundApp || snapshot.processMatches.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 bg-background/60 p-2 rounded-md border border-border/60">
            {snapshot.foregroundApp && snapshot.foregroundApp !== "unknown" && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <AppWindow className="size-3.5 text-blue-400 shrink-0" />
                <span className="text-[10px] uppercase font-semibold text-muted-foreground">Focus:</span>
                <span className="font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded text-[10px]">
                  {formatAppName(snapshot.foregroundApp)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({snapshot.foregroundApp})
                </span>
              </div>
            )}

            {snapshot.processMatches.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <Bot className="size-3.5 text-red-400 shrink-0" />
                <span className="text-[10px] uppercase font-semibold text-destructive">Proc:</span>
                {snapshot.processMatches.map((proc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-red-500/15 border border-red-500/30 text-red-300 font-semibold px-2 py-0.5 rounded text-[10px]"
                  >
                    <Terminal className="size-2.5" />
                    <span>{formatAppName(proc)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rule Findings Embedded Inside This State Box */}
        {snapshot.findings.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-border/60">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
              Flagged Rule Infractions ({snapshot.findings.length})
            </span>
            <div className="space-y-2">
              {snapshot.findings.map((f, idx) => {
                const findingObj: EvidenceFinding = {
                  id: `${snapshot.id}-${idx}`,
                  ruleId: f.ruleId,
                  title: f.title,
                  category: "FINDING",
                  weight: f.weight,
                  evidence: f.evidence,
                };
                return <EvidenceCard key={idx} finding={findingObj} />;
              })}
            </div>
          </div>
        )}

        {/* Bottom Environment Metadata */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground font-mono pt-1">
          {snapshot.lanIp && <span>LAN: {snapshot.lanIp}</span>}
          {snapshot.totalProcesses != null && <span>Processes: {snapshot.totalProcesses}</span>}
          {snapshot.internetReachable != null && (
            <span className={snapshot.internetReachable ? "text-cyan-400" : "text-destructive font-bold"}>
              {snapshot.internetReachable ? "Internet: Online" : "Internet: Offline"}
            </span>
          )}
        </div>

        {/* Collapsible Raw JSON */}
        {showRaw && snapshot.rawSignals && (
          <pre className="mt-2 p-2.5 rounded bg-black/60 text-[10px] text-foreground font-mono overflow-x-auto border border-border">
            {JSON.stringify(snapshot.rawSignals, null, 2)}
          </pre>
        )}
      </div>
    </li>
  );
}

