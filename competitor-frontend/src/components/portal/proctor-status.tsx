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
import { Button } from "@/components/ui/button";

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
    accessMode,
    code,
    local,
    serverReachable,
    starting,
  } = useProctor();

  if (!resolved) return null;

  if (starting) {
    return (
      <Badge variant="outline" className="gap-1.5 border-warning bg-warning/20 text-warning text-xs h-7 px-2.5">
        <Loader2 className="h-3.5 w-3.5 pixel-spin" />
        Proctor starting...
      </Badge>
    );
  }

  if (exempt) {
    return (
      <Badge variant="outline" className="gap-1.5 text-xs h-7 px-2.5">
        <ShieldOff className="h-3.5 w-3.5" />
        Proctor exempt
      </Badge>
    );
  }

  if (!submissionsAllowed) {
    const cutOff = Boolean(local && local.healthy === false);
    // "PROCTOR INACTIVE" would be a lie when the agent is reporting normally and it
    // is the window that is not permitted — and it would send the contestant off to
    // restart a client that is already working.
    const notAllowed = code === "CLIENT_NOT_ALLOWED";
    return (
      <Badge
        variant="destructive"
        className="gap-1.5 text-xs h-7 px-2.5"
        title={
          notAllowed
            ? "Scored submissions from this window are not enabled for your account."
            : local?.support_code
              ? `Support code ${local.support_code}`
              : undefined
        }
      >
        <ShieldOff className="h-3.5 w-3.5" />
        {notAllowed
          ? "Window not allowed"
          : cutOff
            ? "Proctor off-grid"
            : "Proctor inactive"}
      </Badge>
    );
  }

  // Allowed, but we could not confirm it with the server this cycle.
  if (!serverReachable) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-warning bg-warning/20 text-warning text-xs h-7 px-2.5"
        title="The portal could not reach the contest server on the last check."
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Net unstable
      </Badge>
    );
  }

  // Submitting with no agent behind the page, by grant. Saying so plainly beats
  // "PROCTOR UNVERIFIED", which reads as a fault when it is the arrangement an
  // organizer set up for this account.
  if (accessMode === "WEB_ONLY") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 text-xs h-7 px-2.5"
        title="An organizer allowed this account to submit from a browser without the proctor client."
      >
        <ShieldOff className="h-3.5 w-3.5" />
        Browser access
      </Badge>
    );
  }

  const attested = Boolean(local?.attest_nonce);

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-success bg-success/20 text-success text-xs h-7 px-2.5"
      title={
        attested
          ? `Proctor agent ${local?.agent_version} · support code ${local?.support_code}`
          : "Proctoring is active, but this page could not reach the agent on this machine."
      }
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      {attested ? "Proctor active" : "Proctor unverified"}
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
    code,
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
        className="absolute inset-x-0 top-0 z-40 flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-2 text-xs text-warning"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 pixel-spin" />
        <span className="font-semibold">Proctoring is starting.</span>
        <span>
          {remedy ??
            "Submissions unlock as soon as the proctor client reports in."}
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="absolute inset-x-0 top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-destructive/40 bg-destructive/20 px-4 py-2.5 text-xs text-destructive"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="font-semibold">
        {/* The agent may be running perfectly — this window is simply not one this
            account may submit from. Blaming the client would send the contestant to
            restart something that is already working. */}
        {code === "CLIENT_NOT_ALLOWED"
          ? "Submissions locked — this window isn't allowed for scored submissions."
          : "Submissions locked — proctor client isn't reporting."}
      </span>
      <span>
        {remedy ?? "Start the proctor client, then submit again."}
        {code !== "CLIENT_NOT_ALLOWED" &&
          secondsSincePing > 0 &&
          ` Last report ${formatAgo(secondsSincePing)} ago.`}
      </span>
      <span className="ml-auto flex items-center gap-3">
        {local?.support_code && (
          <span className="font-mono text-xs">
            Code: <span className="font-semibold">{local.support_code}</span>
          </span>
        )}
        <Button type="button" variant="destructive" size="sm" onClick={() => window.location.reload()}>
          <RotateCw className="h-3 w-3" />
          Retry
        </Button>
      </span>
      <p className="w-full text-muted-foreground text-[11px]">
        Test runs are enabled. Scored submissions are held until proctor connects.
      </p>
    </div>
  );
}

function formatAgo(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}
