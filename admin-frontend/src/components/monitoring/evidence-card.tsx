"use client";

import { useState } from "react";
import {
  AppWindow,
  Binary,
  Bot,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Code2,
  Globe,
  Layers,
  Network,
  Package,
  Radio,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { formatAppName } from "@/lib/monitoring";
import type { EvidenceFinding } from "@/types/proctor";

type EvidenceCardProps = {
  finding: EvidenceFinding;
};

export function EvidenceCard({ finding }: EvidenceCardProps) {
  const [showRaw, setShowRaw] = useState(false);
  const evidence = (finding.evidence as Record<string, any>) || {};

  const getCategoryConfig = (category: string | undefined, ruleId: string) => {
    if (ruleId === "ai.code.paste_burst") {
      return {
        icon: ClipboardPaste,
        badgeBg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        border: "border-amber-500/30",
        label: "PASTE DYNAMICS",
      };
    }
    if (ruleId.startsWith("ai.ext.")) {
      return {
        icon: Package,
        badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        border: "border-emerald-500/30",
        label: "EXTENSION",
      };
    }
    if (ruleId.startsWith("ai.proc.")) {
      return {
        icon: Bot,
        badgeBg: "bg-red-500/15 text-red-400 border-red-500/30",
        border: "border-red-500/30",
        label: "AI PROCESS",
      };
    }
    if (ruleId.startsWith("ai.port.")) {
      return {
        icon: Radio,
        badgeBg: "bg-purple-500/15 text-purple-400 border-purple-500/30",
        border: "border-purple-500/30",
        label: "LOCAL LLM PORT",
      };
    }
    if (ruleId.startsWith("app.") || ruleId.startsWith("ai.fg.")) {
      return {
        icon: AppWindow,
        badgeBg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        border: "border-blue-500/30",
        label: "FOREGROUND",
      };
    }
    if (ruleId.startsWith("net.")) {
      return {
        icon: Globe,
        badgeBg: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
        border: "border-cyan-500/30",
        label: "NETWORK",
      };
    }
    return {
      icon: ShieldAlert,
      badgeBg: "bg-muted text-muted-foreground border-border",
      border: "border-border",
      label: category || "INTEGRITY",
    };
  };

  const config = getCategoryConfig(finding.category, finding.ruleId);
  const IconComponent = config.icon;

  return (
    <div
      className={`rounded-lg border ${config.border} bg-card/60 p-4 text-xs shadow-sm transition-all hover:bg-card/90 space-y-3`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-md ${config.badgeBg} border`}>
            <IconComponent className="size-4 shrink-0" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground">{finding.title}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${config.badgeBg}`}>
                {config.label}
              </span>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              Rule: <span className="text-foreground/80">{finding.ruleId}</span> · Weight:{" "}
              <span className="font-semibold text-foreground">{finding.weight ?? 0}</span>
              {finding.occurrences && finding.occurrences > 1 ? ` · Observed ${finding.occurrences} times` : ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRaw((prev) => !prev)}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border border-border transition-colors cursor-pointer"
        >
          {showRaw ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          JSON
        </button>
      </div>

      {/* Structured Visual Evidence */}
      <div className="bg-background/60 rounded-md p-3 border border-border/70 space-y-2">
        {/* Case 1: Paste Burst Telemetry */}
        {finding.ruleId === "ai.code.paste_burst" && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-card p-2 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Pasted Characters
                </span>
                <p className="text-sm font-mono font-bold text-amber-400">
                  {evidence.pasted_chars ?? 0}
                  {evidence.pasted_ratio != null && (
                    <span className="text-[11px] font-normal text-muted-foreground ml-1">
                      ({Math.round(evidence.pasted_ratio * 100)}%)
                    </span>
                  )}
                </p>
              </div>

              <div className="bg-card p-2 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Typed Keystrokes
                </span>
                <p className="text-sm font-mono font-bold text-foreground">
                  {evidence.typed_count ?? 0}
                </p>
              </div>

              <div className="bg-card p-2 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Total Code Size
                </span>
                <p className="text-sm font-mono font-bold text-foreground">
                  {evidence.code_length ?? 0} B
                </p>
              </div>

              <div className="bg-card p-2 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Max Paste Chunk
                </span>
                <p className="text-sm font-mono font-bold text-amber-400">
                  {evidence.max_paste_size ?? 0} B
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Large code block pasted from clipboard with minimal typed keystroke cadence.
            </p>
          </div>
        )}

        {/* Case 2: Process Matches (e.g. Copilot, Claude CLI, Cursor) */}
        {(finding.ruleId.startsWith("ai.proc.") || Array.isArray(evidence.matches)) && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              Matched Processes & Binaries
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(evidence.matches || []).map((m: string, idx: number) => {
                const friendly = formatAppName(m);
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-semibold px-2 py-0.5 rounded"
                  >
                    <Terminal className="size-3" />
                    <span>{friendly}</span>
                    {friendly.toLowerCase() !== m.toLowerCase() && (
                      <span className="text-[10px] text-red-400/70 font-mono">({m})</span>
                    )}
                  </span>
                );
              })}
              {evidence.total != null && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  (out of {evidence.total} running processes)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Case 3: Installed AI Extensions */}
        {finding.ruleId === "ai.ext.detected" && Array.isArray(evidence.extensions) && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              Detected Editor Extensions
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {evidence.extensions.map((ext: string, idx: number) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] px-2 py-0.5 rounded"
                >
                  <Package className="size-3" />
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Case 4: Unauthorized Foreground Application */}
        {(finding.ruleId === "app.unauthorized_foreground" || finding.ruleId === "ai.fg.denylist") && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                Focused Application
              </span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold text-xs px-2.5 py-1 rounded">
                  <AppWindow className="size-3.5" />
                  {formatAppName(evidence.app) || "Unknown Application"}
                </span>
                {evidence.app && formatAppName(evidence.app).toLowerCase() !== String(evidence.app).toLowerCase() && (
                  <span className="font-mono text-[10px] text-muted-foreground">({evidence.app})</span>
                )}
              </div>
            </div>
            {evidence.dwell_ms != null && (
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  Focus Dwell
                </span>
                <span className="font-mono font-bold text-foreground text-xs">
                  {Math.round(evidence.dwell_ms / 1000)}s
                </span>
              </div>
            )}
          </div>
        )}

        {/* Case 5: Local LLM Port Scanner */}
        {finding.ruleId.startsWith("ai.port.") && (
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                Confirmed Model Daemon
              </span>
              <span className="font-bold text-purple-300 text-sm">
                {evidence.product || "Local Model Server"}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Listening Port
              </span>
              <span className="font-mono font-bold text-purple-400 text-xs">
                :{evidence.port}
              </span>
            </div>
          </div>
        )}

        {/* Case 6: Internet Reachability */}
        {finding.ruleId === "net.internet" && (
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
              Network Egress Probes
            </span>
            <p className="text-[11px] text-foreground font-mono">
              Outbound DNS & TCP reachable via {(evidence.probes || []).join(", ") || "1.1.1.1:53"}
            </p>
          </div>
        )}
      </div>

      {/* Expandable Raw JSON */}
      {showRaw && (
        <pre className="p-2.5 rounded bg-black/60 text-[10px] text-foreground font-mono overflow-x-auto border border-border">
          {JSON.stringify(evidence, null, 2)}
        </pre>
      )}
    </div>
  );
}
