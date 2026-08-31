import { Clock, Globe, ShieldOff, Wifi, WifiOff } from "lucide-react";

import { formatDuration } from "@/lib/monitoring";
import type { CompetitorHeartbeat, TelemetryStatus } from "@/types/telemetry";

export function StatusBadge({ status, inGap }: { status: TelemetryStatus; inGap?: boolean }) {
  if (inGap) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/20 border border-destructive px-2.5 py-0.5 text-[11px] font-bold text-destructive animate-pulse">
        <WifiOff className="size-3" /> BLACKOUT
      </span>
    );
  }
  switch (status) {
    case "ONLINE":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
          <Wifi className="size-3" /> ONLINE
        </span>
      );
    case "STALE":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
          <Clock className="size-3" /> STALE
        </span>
      );
    case "OFFLINE":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 border border-destructive/40 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
          <WifiOff className="size-3" /> OFFLINE
        </span>
      );
    default:
      return null;
  }
}

export function SeverityBadge({
  severity,
  score,
}: {
  severity: "HIGH" | "MEDIUM" | "LOW";
  score: number;
}) {
  const styles = {
    HIGH: "bg-destructive/15 border-destructive/30 text-destructive",
    MEDIUM: "bg-amber-500/15 border-amber-500/30 text-amber-400",
    LOW: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${styles[severity]}`}
    >
      {severity} ({score})
    </span>
  );
}

export function ModeBadge({ item }: { item: CompetitorHeartbeat }) {
  if (item.proctor_exempt) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground border border-border">
        <ShieldOff className="size-3" /> EXEMPT
      </span>
    );
  }
  if (item.client_type === "WEB") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/30">
        <Globe className="size-3" /> BROWSER
      </span>
    );
  }
  return <span className="text-[10px] text-muted-foreground">AGENT ONLY</span>;
}

export function DarkForCell({ item }: { item: CompetitorHeartbeat }) {
  if (!item.enrolled) {
    return <span className="text-[10px] text-warning">never enrolled</span>;
  }
  if (item.status === "ONLINE") {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  return (
    <div className="text-[11px]">
      <span className={item.in_gap ? "font-semibold text-destructive" : "text-warning"}>
        {formatDuration(item.offline_seconds)}
      </span>
      <div className="text-[10px] text-muted-foreground">
        {item.stopped_reason
          ? "stopped deliberately"
          : item.in_gap
            ? "blackout, no clean stop"
            : "no reports"}
      </div>
    </div>
  );
}

export function SignalsCell({ item }: { item: CompetitorHeartbeat }) {
  const hasApp = item.active_window && item.active_window !== "" && item.active_window !== "unknown";
  const hasProc = item.process_matches && item.process_matches.length > 0;
  const hasNet = item.internet_reachable;

  if (!hasApp && !hasProc && !hasNet) {
    return <span className="text-[10px] text-muted-foreground">clean</span>;
  }

  return (
    <div className="flex flex-col gap-1 max-w-[260px]">
      {hasApp && (
        <div className="flex items-center gap-1 text-[11px] font-mono text-foreground/90 truncate" title={item.active_window}>
          <span className="text-[10px] uppercase font-semibold text-muted-foreground">Focus:</span>
          <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] truncate">{item.active_window}</span>
        </div>
      )}
      {hasProc && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[10px] uppercase font-semibold text-destructive">Proc:</span>
          {item.process_matches.map((p, idx) => (
            <span
              key={idx}
              className="bg-destructive/15 border border-destructive/30 text-destructive font-mono text-[10px] font-bold px-1.5 py-0.2 rounded"
            >
              {p}
            </span>
          ))}
        </div>
      )}
      {hasNet && !hasProc && !hasApp && (
        <span className="text-[11px] text-cyan-400 font-mono">internet reachable</span>
      )}
    </div>
  );
}

export function formatTimeAgo(isoString: string): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Never";

  const diffSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (diffSeconds < 10) return "Just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  return `${Math.floor(diffSeconds / 3600)}h ago`;
}
