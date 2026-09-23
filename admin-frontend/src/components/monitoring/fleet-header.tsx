"use client";

import { WifiOff } from "lucide-react";
import { formatClock } from "@/lib/monitoring";
import type { ProctorOverview } from "@/types/proctor";

/**
 * The contest-day answer to "is everyone reporting?".
 *
 * Only the counts that would make an organizer stand up carry colour. Enrolled and
 * online are the baseline, so they stay neutral — if every tile is coloured, none
 * of them mean anything.
 */
export function FleetHeader({ overview }: { overview: ProctorOverview | null }) {
  if (!overview) return null;

  const f = overview.fleet;
  const notReporting = f.stale + f.offline;
  const missing = f.competitors - f.enrolled;

  return (
    <div className="flex flex-col gap-3">
      {overview.incident && <IncidentBanner incident={overview.incident} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Enrolled" value={`${f.enrolled} / ${f.competitors}`} />
        <Tile label="Online" value={f.online} />
        <Tile
          label="Not reporting"
          value={notReporting}
          tone={notReporting > 0 ? "warning" : "neutral"}
          hint={`${f.stale} stale · ${f.offline} offline`}
        />
        <Tile
          label="In blackout"
          value={f.inGap}
          tone={f.inGap > 0 ? "destructive" : "neutral"}
          hint="open gap, no clean stop"
        />
        <Tile
          label="Never started"
          value={f.neverReported + missing}
          tone={f.neverReported + missing > 0 ? "warning" : "neutral"}
          hint={`${missing} unenrolled · ${f.neverReported} silent`}
        />
        <Tile
          label="High risk"
          value={f.highRisk}
          tone={f.highRisk > 0 ? "destructive" : "neutral"}
          hint={`${f.mediumRisk} medium`}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        {f.browserActive} on the browser fallback · {f.stopped} stopped proctoring deliberately ·{" "}
        {f.exempt} exempt
      </p>
    </div>
  );
}

function IncidentBanner({ incident }: { incident: NonNullable<ProctorOverview["incident"]> }) {
  const open = !incident.endedAt;
  const minutes = Math.max(1, Math.round(incident.durationSeconds / 60));

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-xs ${
        open
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      <WifiOff className="size-4 shrink-0" />
      <span className="font-semibold">
        {open ? "Fleet telemetry incident — in progress" : "Fleet telemetry incident — recovered"}
      </span>
      <span>
        {incident.affectedAgents} of {incident.enrolledAgents} agents went quiet at once, for{" "}
        {minutes}m. Contestant blackouts are suppressed for this window — treat gap records from it
        as ours, not theirs.
      </span>
      <span className="ml-auto font-mono">
        {formatClock(incident.startedAt)} →{" "}
        {incident.endedAt ? formatClock(incident.endedAt) : "now"}
      </span>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "warning" | "destructive";
  hint?: string;
}) {
  const toneClass =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : tone === "warning"
        ? "border-warning/40 bg-warning/5 text-warning"
        : "border-border bg-card text-foreground";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] opacity-70">{hint}</div>}
    </div>
  );
}
