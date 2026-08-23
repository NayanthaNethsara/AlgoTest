"use client";

import {
  AlertTriangle,
  Loader2,
  RotateCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useProctor } from "@/components/portal/proctor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
        className="gap-1.5 border-warning bg-warning/20 text-warning text-xs h-7 px-2.5"
      >
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

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-success bg-success/20 text-success text-xs h-7 px-2.5"
      title={
        local?.agent_version
          ? `Proctor agent ${local.agent_version} · support code ${local.support_code}`
          : "Proctoring is active and verified by the contest server."
      }
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      Proctor active
    </Badge>
  );
}

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
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => window.location.reload()}
        >
          <RotateCw className="h-3 w-3" />
          Retry
        </Button>
      </span>
      <p className="w-full text-muted-foreground text-[11px]">
        Test runs are enabled. Scored submissions are held until proctor
        connects.
      </p>
    </div>
  );
}

function formatAgo(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}
