"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatClock } from "@/lib/monitoring";
import { revokeAgentAction } from "@/actions/telemetry";
import type { EnrolledAgent } from "@/types/proctor";

/**
 * Enrolment history, including revoked and stopped agents.
 *
 * The row that matters is a contestant with more than one enrolment: swapping
 * machines mid-contest is what a two-laptop setup looks like from here.
 */
export function AgentsTable({
  agents,
  onChanged,
}: {
  agents: EnrolledAgent[];
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const enrolmentCounts = agents.reduce<Record<string, number>>((acc, agent) => {
    acc[agent.userId] = (acc[agent.userId] ?? 0) + 1;
    return acc;
  }, {});

  const revoke = (agent: EnrolledAgent) => {
    const reason = window.prompt(
      `Revoke the proctor enrolment for ${agent.displayName}?\n\nThey will have to enrol again before they can submit. Reason:`,
      "",
    );
    if (reason === null) return;

    startTransition(async () => {
      const result = await revokeAgentAction(agent.id, reason.trim() || "revoked by organizer");
      setError(result.error ?? null);
      if (!result.error) onChanged();
    });
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
      {error && (
        <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b bg-muted/30 text-muted-foreground font-medium">
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Contestant</th>
              <th className="px-4 py-3">Machine</th>
              <th className="px-4 py-3">Platform &amp; version</th>
              <th className="px-4 py-3">Enrolled</th>
              <th className="px-4 py-3">Last report</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {agents.map((agent) => (
              <tr key={agent.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <AgentStateBadge agent={agent} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/monitoring/${agent.userId}`}
                    className="font-semibold text-foreground hover:underline"
                  >
                    {agent.displayName}
                  </Link>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    @{agent.username}
                    {enrolmentCounts[agent.userId] > 1 && (
                      <span className="ml-1.5 text-destructive">
                        · {enrolmentCounts[agent.userId]} enrolments
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-[11px]">{agent.machineId.slice(0, 12)}</td>
                <td className="px-4 py-3">
                  <div>{agent.platform || "unknown"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    v{agent.agentVersion || "?"}
                    {agent.loopbackPort > 0 && ` · port ${agent.loopbackPort}`}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatClock(agent.enrolledAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatClock(agent.lastSeenAt)}
                  {agent.stoppedReason && (
                    <div className="text-[10px] text-muted-foreground">{agent.stoppedReason}</div>
                  )}
                  {agent.revokedReason && (
                    <div className="text-[10px] text-muted-foreground">{agent.revokedReason}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!agent.revokedAt && (
                    <button
                      onClick={() => revoke(agent)}
                      disabled={isPending}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No agents have enrolled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Enrolment state owns colour here: revoked and blacked-out are the two states an
// organizer acts on, and everything else stays neutral.
function AgentStateBadge({ agent }: { agent: EnrolledAgent }) {
  if (agent.revokedAt) {
    return <Pill tone="muted">REVOKED</Pill>;
  }
  if (agent.inGap) {
    return <Pill tone="destructive">BLACKOUT</Pill>;
  }
  if (agent.stoppedAt) {
    return <Pill tone="warning">STOPPED</Pill>;
  }
  return <Pill tone="success">ACTIVE</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "destructive" | "muted";
  children: React.ReactNode;
}) {
  const toneClass = {
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    muted: "text-muted-foreground border-border",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}
    >
      {children}
    </span>
  );
}
