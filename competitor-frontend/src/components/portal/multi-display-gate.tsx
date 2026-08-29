"use client";

import { MonitorOff, ShieldAlert } from "lucide-react";
import { useProctor } from "@/components/portal/proctor-provider";
import { isDesktopClient } from "@/lib/desktop";

export function MultiDisplayGate() {
  const { local } = useProctor();
  const isDesktop = isDesktopClient();

  const hasMultipleMonitors = Boolean(
    isDesktop && (local?.multiple_monitors_detected || (local?.monitor_count && local.monitor_count > 1)),
  );

  if (!hasMultipleMonitors) {
    return null;
  }

  const monitorCount = local?.monitor_count ?? 2;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="multi-display-title"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-6 animate-in fade-in-50 duration-150 select-none"
    >
      <div className="pixel-raised flex w-full max-w-lg flex-col gap-5 bg-card p-6 shadow-2xl border-4 border-destructive">
        <div className="flex items-center gap-3 border-b-2 border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center pixel-flat bg-destructive text-white shrink-0">
            <MonitorOff className="h-6 w-6" />
          </div>
          <div>
            <h2
              id="multi-display-title"
              className="text-base font-bold uppercase tracking-wider text-destructive"
            >
              Multiple Displays Detected
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Strict Single-Display Policy Enforced
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 text-xs text-foreground leading-relaxed">
          <p>
            MiniAlgothon is running in strict lockdown mode. Competitions must be
            completed exclusively on a <strong>single display</strong>.
          </p>
          <div className="pixel-flat bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive flex items-start gap-2.5">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Required Action: </span>
              Please unplug or disconnect all secondary monitors, external displays,
              or video cables (HDMI, DisplayPort, USB-C).
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t-2 border-border pt-4 text-xs">
          <span className="text-muted-foreground">
            Detected Displays: <strong className="text-destructive font-mono">{monitorCount}</strong>
          </span>
          <span className="text-xs font-semibold text-muted-foreground animate-pulse">
            Waiting for external displays to disconnect…
          </span>
        </div>
      </div>
    </div>
  );
}
