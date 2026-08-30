"use client";

import { useState, useRef, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Radio,
  RotateCw,
  Server,
  ShieldCheck,
  ShieldOff,
  Terminal,
  X,
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
    secondsSincePing,
  } = useProctor();

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!resolved) return null;

  const handleCopySupportCode = async () => {
    if (local?.support_code) {
      await navigator.clipboard.writeText(local.support_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  let icon = <ShieldCheck className="h-3.5 w-3.5" />;
  let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "outline";
  let badgeClass = "border-success bg-success/20 text-success";
  let statusText = "Active & Verified";
  let title = local?.agent_version
    ? `Proctor agent ${local.agent_version} · support code ${local.support_code}`
    : "Proctoring is active and verified by the contest server.";

  if (starting) {
    icon = <Loader2 className="h-3.5 w-3.5 pixel-spin" />;
    badgeClass = "border-warning bg-warning/20 text-warning";
    statusText = "Starting up";
    title = "Proctor starting... Waiting for initial heartbeat.";
  } else if (exempt) {
    icon = <ShieldOff className="h-3.5 w-3.5" />;
    badgeClass = "border-muted-foreground/40 text-muted-foreground";
    statusText = "Exempt";
    title = "Proctor exempt — browser access approved.";
  } else if (!submissionsAllowed) {
    const cutOff = Boolean(local && local.healthy === false);
    const notAllowed = code === "CLIENT_NOT_ALLOWED";
    statusText = notAllowed
      ? "Window Not Allowed"
      : cutOff
        ? "Proctor Off-Grid"
        : "Proctor Inactive";
    icon = <ShieldOff className="h-3.5 w-3.5" />;
    badgeVariant = "destructive";
    badgeClass = "border-destructive bg-destructive/20 text-destructive";
    title = local?.support_code ? `Support code ${local.support_code}` : statusText;
  } else if (!serverReachable) {
    icon = <AlertTriangle className="h-3.5 w-3.5" />;
    badgeClass = "border-warning bg-warning/20 text-warning";
    statusText = "Network Unstable";
    title = "The portal could not reach the contest server on the last check.";
  } else if (accessMode === "WEB_ONLY") {
    icon = <ShieldOff className="h-3.5 w-3.5" />;
    badgeClass = "border-muted-foreground/40 text-muted-foreground";
    statusText = "Browser Access";
    title = "Browser access mode approved.";
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={`${title} (Click for telemetry details)`}
        className="cursor-pointer focus:outline-none shrink-0"
      >
        <Badge
          variant={badgeVariant}
          className={`h-7 w-7 p-0 flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity ${badgeClass}`}
        >
          {icon}
        </Badge>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Proctor Telemetry Diagnostics"
          className="absolute right-0 top-full mt-1.5 z-50 w-72 pixel-raised bg-card p-3 text-xs shadow-2xl animate-in fade-in-50 zoom-in-95 duration-100 select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-black/40 pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-primary shrink-0" />
              <span className="font-bold text-foreground uppercase tracking-wide text-xs">
                Proctor Telemetry
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Status Indicator Row */}
          <div className="flex items-center justify-between bg-muted/40 p-2 pixel-flat mb-2.5">
            <span className="text-[11px] text-muted-foreground font-semibold">
              Live State:
            </span>
            <span className="font-bold text-xs uppercase flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
              {statusText}
            </span>
          </div>

          {/* Support Code Box */}
          {local?.support_code && (
            <div className="p-2 border border-primary/30 bg-primary/10 pixel-flat mb-2.5 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Support Code
                </div>
                <div className="font-mono font-bold text-foreground text-xs">
                  {local.support_code}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopySupportCode}
                className="h-6 px-2 text-[11px] pixel-flat bg-card hover:bg-muted cursor-pointer"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-success mr-1" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground mr-1" />
                )}
                <span>{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          )}

          {/* Telemetry Cadence Grid */}
          <div className="space-y-1.5 border-t border-border pt-2 mb-2.5 text-[11px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <Radio className="h-3 w-3 text-primary" /> Heartbeat Rate:
              </span>
              <span className="font-mono text-foreground font-semibold">Every 15s</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <Server className="h-3 w-3 text-primary" /> Last Report:
              </span>
              <span className="font-mono text-foreground">
                {secondsSincePing > 0 ? `${secondsSincePing}s ago` : "Just now"}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <Terminal className="h-3 w-3 text-primary" /> Agent Version:
              </span>
              <span className="font-mono text-foreground">
                {local?.agent_version ? `v${local.agent_version}` : "v0.2.0"}
              </span>
            </div>
            {local?.loopback_port && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Loopback Interface:</span>
                <span className="font-mono text-foreground">
                  :{local.loopback_port}
                </span>
              </div>
            )}
          </div>

          {/* Active Monitored Signals Info */}
          <div className="border-t border-border pt-2 mb-3">
            <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">
              Endpoint Signals Monitored:
            </div>
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center gap-1.5 text-foreground">
                <ShieldCheck className="h-3 w-3 text-success shrink-0" />
                <span>Local AI port probes (Ollama, LMStudio, etc.)</span>
              </div>
              <div className="flex items-center gap-1.5 text-foreground">
                <ShieldCheck className="h-3 w-3 text-success shrink-0" />
                <span>Restricted background process watchdog</span>
              </div>
              <div className="flex items-center gap-1.5 text-foreground">
                <ShieldCheck className="h-3 w-3 text-success shrink-0" />
                <span>Gateway connection integrity & attestation</span>
              </div>
            </div>
          </div>

          {/* Footer Quick Action */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="w-full text-xs h-7 pixel-flat cursor-pointer"
            >
              <RotateCw className="h-3 w-3 mr-1" />
              Re-verify Status
            </Button>
          </div>
        </div>
      )}
    </div>
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
