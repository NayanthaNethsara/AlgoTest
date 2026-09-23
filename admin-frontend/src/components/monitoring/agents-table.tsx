"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ServerOffIcon, ShieldOffIcon } from "lucide-react";
import { toast } from "sonner";
import { formatClock } from "@/lib/monitoring";
import { revokeAgentAction } from "@/lib/actions/monitoring";
import { getErrorMessage } from "@/lib/errors";
import {
  AccessReasonDialog,
  type AccessReasonRequest,
} from "@/components/proctoring/access-reason-dialog";
import { DataPagination } from "@/components/shell/data-pagination";
import { EmptyState } from "@/components/shell/data-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePagination } from "@/hooks/use-pagination";
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
  const [revokeTarget, setRevokeTarget] = useState<EnrolledAgent | null>(null);

  const pagination = usePagination(agents);

  const enrolmentCounts = agents.reduce<Record<string, number>>((acc, agent) => {
    acc[agent.userId] = (acc[agent.userId] ?? 0) + 1;
    return acc;
  }, {});

  function confirmRevoke(reason: string) {
    const agent = revokeTarget;
    if (!agent) return;

    startTransition(async () => {
      try {
        const result = await revokeAgentAction(agent.id, reason || "revoked by organizer");
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setRevokeTarget(null);
        toast.success("Enrolment revoked", { description: agent.displayName });
        onChanged();
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to revoke the enrolment."));
      }
    });
  }

  const revokeRequest: AccessReasonRequest | null = revokeTarget && {
    title: "Revoke proctor enrolment",
    consequence: `${revokeTarget.displayName} must enrol a proctor agent again before they can submit.`,
    subject: `${revokeTarget.displayName} · ${revokeTarget.machineId.slice(0, 12)}`,
    defaultReason: "revoked by organizer",
    confirmLabel: "Revoke enrolment",
  };

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={<ServerOffIcon />}
        title="No agents enrolled"
        description="Contestant proctor agents appear here as soon as they enrol."
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>State</TableHead>
              <TableHead>Contestant</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Platform &amp; version</TableHead>
              <TableHead>Enrolled</TableHead>
              <TableHead>Last report</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.items.map((agent) => {
              const enrolments = enrolmentCounts[agent.userId];
              return (
                <TableRow key={agent.id}>
                  <TableCell>
                    <AgentStateBadge agent={agent} />
                  </TableCell>

                  <TableCell className="max-w-56">
                    <Link
                      href={`/monitoring/${agent.userId}`}
                      className="text-xs font-semibold hover:underline"
                    >
                      {agent.displayName}
                    </Link>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      @{agent.username}
                      {enrolments > 1 && (
                        <span className="ml-1.5 text-destructive">· {enrolments} enrolments</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger render={<span className="font-mono text-[11px]" />}>
                        {agent.machineId.slice(0, 12)}
                      </TooltipTrigger>
                      <TooltipContent className="font-mono">{agent.machineId}</TooltipContent>
                    </Tooltip>
                  </TableCell>

                  <TableCell>
                    <div className="text-xs">{agent.platform || "unknown"}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      v{agent.agentVersion || "?"}
                      {agent.loopbackPort > 0 && ` · port ${agent.loopbackPort}`}
                      {agent.binaryHash && (
                        <Tooltip>
                          <TooltipTrigger render={<span />}>
                            {` · ${agent.binaryHash.slice(0, 8)}`}
                          </TooltipTrigger>
                          <TooltipContent className="font-mono">
                            SHA-256: {agent.binaryHash}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-xs whitespace-nowrap">
                    {formatClock(agent.enrolledAt)}
                  </TableCell>

                  <TableCell className="text-xs whitespace-nowrap">
                    {formatClock(agent.lastSeenAt)}
                    {(agent.stoppedReason || agent.revokedReason) && (
                      <div className="text-[10px] text-muted-foreground">
                        {agent.revokedReason || agent.stoppedReason}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {!agent.revokedAt && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setRevokeTarget(agent)}
                        disabled={isPending}
                        className="gap-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <ShieldOffIcon /> Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <DataPagination state={pagination} itemLabel="agent" />
      </div>

      <AccessReasonDialog
        request={revokeRequest}
        pending={isPending}
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  );
}

// Enrolment state owns colour here: revoked and blacked-out are the two states an
// organizer acts on, and everything else stays neutral.
function AgentStateBadge({ agent }: { agent: EnrolledAgent }) {
  if (agent.revokedAt) {
    return (
      <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">
        REVOKED
      </Badge>
    );
  }
  if (agent.inGap) {
    return (
      <Badge
        variant="outline"
        className="border-destructive/20 bg-destructive/10 text-[10px] font-semibold text-destructive"
      >
        BLACKOUT
      </Badge>
    );
  }
  if (agent.stoppedAt) {
    return (
      <Badge
        variant="outline"
        className="border-warning/20 bg-warning/10 text-[10px] font-semibold text-warning"
      >
        STOPPED
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-success/20 bg-success/10 text-[10px] font-semibold text-success"
    >
      ACTIVE
    </Badge>
  );
}
