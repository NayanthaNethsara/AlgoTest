"use client";

import {
  AlertTriangle,
  Loader2,
  RotateCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useProctor } from "@/components/providers/proctor-provider";
import { Badge } from "@/components/ui/badge";

/**
 * Persistent proctoring indicator. An agent that keeps running in the background
 * has to be visible in the UI it is watching — there is no hidden state anywhere
 * in this design.
 */
export function ProctorPill() {
  const {
    resolved,
    submissionsAllowed,
    exempt,
    local,
    serverReachable,
    starting,
  } = useProctor();

  if (!resolved) return null;

  if (starting) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-warning/40 bg-warning/10 text-warning text-[11px] h-7 px-2.5"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Proctoring starting…
      </Badge>
    );
  }

  if (exempt) {
    return (
      <Badge variant="outline" className="gap-1.5 text-[11px] h-7 px-2.5">
        <ShieldOff className="h-3.5 w-3.5" />
        Proctoring exempt
      </Badge>
    );
  }

  if (!submissionsAllowed) {
    const cutOff = Boolean(local && local.healthy === false);
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-destructive/40 bg-destructive/10 text-destructive text-[11px] h-7 px-2.5"
        title={
          local?.support_code ? `Support code ${local.support_code}` : undefined
        }
      >
        <ShieldOff className="h-3.5 w-3.5" />
        {cutOff ? "Proctoring not reporting" : "Proctoring off"}
      </Badge>
    );
  }

  // Allowed, but we could not confirm it with the server this cycle.
  if (!serverReachable) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-warning/40 bg-warning/10 text-warning text-[11px] h-7 px-2.5"
        title="The portal could not reach the contest server on the last check."
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Connection unstable
      </Badge>
    );
  }

  const attested = Boolean(local?.attest_nonce);

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-success/40 bg-success/10 text-success text-[11px] h-7 px-2.5"
      title={
        attested
          ? `Proctor agent ${local?.agent_version} · support code ${local?.support_code}`
          : "Proctoring is active, but this page could not reach the agent on this machine."
      }
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      {attested ? "Proctoring active" : "Proctoring active (unverified)"}
    </Badge>
  );
}

/**
 * Non-dismissible notice when scored submissions are locked. It always names the
 * remedy and the support code, because the alternative is a contestant discovering
 * this at the deadline with nothing to tell an organizer.
 */
export function ProctorLockBanner() {
  const {
    resolved,
    submissionsAllowed,
    exempt,
    remedy,
    secondsSincePing,
    local,
    starting,
  } = useProctor();

  if (!resolved || submissionsAllowed || exempt) return null;

  if (starting) {
    return (
      <div
        role="status"
        className="absolute inset-x-0 top-0 z-40 flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2 text-xs text-warning"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="font-semibold">Proctoring is starting.</span>
        <span className="text-warning/90">
          {remedy ??
            "Submissions unlock as soon as the proctor client reports in."}
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="absolute inset-x-0 top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="font-semibold">
        Submissions are locked — the proctor client is not reporting.
      </span>
      <span className="text-destructive/90">
        {remedy ?? "Start the proctor client, then submit again."}
        {secondsSincePing > 0 &&
          ` Last report ${formatAgo(secondsSincePing)} ago.`}
      </span>
      <span className="ml-auto flex items-center gap-3">
        {local?.support_code && (
          <span className="font-mono">
            Support code{" "}
            <span className="font-semibold">{local.support_code}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 font-semibold transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <RotateCw className="h-3 w-3" />
          Retry
        </button>
      </span>
      <p className="w-full text-destructive/80">
        Running code to test it still works. Only scored submissions are held.
      </p>
    </div>
  );
}

function formatAgo(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}
