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
    accessMode,
    code,
    local,
    serverReachable,
    starting,
  } = useProctor();

  if (!resolved) return null;

  if (starting) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-warning bg-warning/20 text-warning text-xs h-7 px-2.5 font-pixel-body"
      >
        <Loader2 className="h-3.5 w-3.5 pixel-spin" />
        PROCTOR STARTING...
      </Badge>
    );
  }

  if (exempt) {
    return (
      <Badge variant="outline" className="gap-1.5 text-xs h-7 px-2.5 font-pixel-body border-black">
        <ShieldOff className="h-3.5 w-3.5" />
        PROCTOR EXEMPT
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
        className="gap-1.5 text-xs h-7 px-2.5 font-pixel-body"
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
          ? "WINDOW NOT ALLOWED"
          : cutOff
            ? "PROCTOR OFF-GRID"
            : "PROCTOR INACTIVE"}
      </Badge>
    );
  }

  // Allowed, but we could not confirm it with the server this cycle.
  if (!serverReachable) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-warning bg-warning/20 text-warning text-xs h-7 px-2.5 font-pixel-body"
        title="The portal could not reach the contest server on the last check."
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        NET UNSTABLE
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
        className="gap-1.5 text-xs h-7 px-2.5 font-pixel-body border-black"
        title="An organizer allowed this account to submit from a browser without the proctor client."
      >
        <ShieldOff className="h-3.5 w-3.5" />
        BROWSER ACCESS
      </Badge>
    );
  }

  const attested = Boolean(local?.attest_nonce);

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-success bg-success/20 text-success text-xs h-7 px-2.5 font-pixel-body"
      title={
        attested
          ? `Proctor agent ${local?.agent_version} · support code ${local?.support_code}`
          : "Proctoring is active, but this page could not reach the agent on this machine."
      }
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      {attested ? "PROCTOR ACTIVE" : "PROCTOR UNVERIFIED"}
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
        className="absolute inset-x-0 top-0 z-40 flex items-center gap-2 border-b-2 border-black bg-warning/20 px-4 py-2 text-xs font-pixel-body text-warning shadow-[0px_4px_0px_#000000]"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 pixel-spin" />
        <span className="font-bold">PROCTORING STARTING.</span>
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
      className="absolute inset-x-0 top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-black bg-destructive/30 px-4 py-2.5 text-xs font-pixel-body text-destructive shadow-[0px_4px_0px_#000000]"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="font-bold uppercase tracking-wider">
        {/* The agent may be running perfectly — this window is simply not one this
            account may submit from. Blaming the client would send the contestant to
            restart something that is already working. */}
        {code === "CLIENT_NOT_ALLOWED"
          ? "SUBMISSIONS LOCKED — THIS WINDOW IS NOT ALLOWED FOR SCORED SUBMISSIONS"
          : "SUBMISSIONS LOCKED — PROCTOR CLIENT IS NOT REPORTING"}
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
            CODE: <span className="font-bold">{local.support_code}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 border-2 border-black bg-destructive text-white px-2.5 py-1 text-xs font-pixel-body uppercase font-bold transition-all hover:bg-destructive/90 active:translate-y-[2px]"
        >
          <RotateCw className="h-3 w-3" />
          RETRY
        </button>
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
