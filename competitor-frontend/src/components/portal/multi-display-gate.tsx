"use client";

import { useState } from "react";
import { LogOut, MonitorOff, ShieldAlert } from "lucide-react";
import { useProctor } from "@/components/portal/proctor-provider";
import { exitDesktopCompetition, isDesktopClient } from "@/lib/desktop";
import { Button } from "@/components/ui/button";

export function MultiDisplayGate() {
  const { local } = useProctor();
  const isDesktop = isDesktopClient();
  const [isConfirmingExit, setIsConfirmingExit] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const hasMultipleMonitors = Boolean(
    isDesktop && (local?.multiple_monitors_detected || (local?.monitor_count && local.monitor_count > 1)),
  );

  if (!hasMultipleMonitors) {
    return null;
  }

  const monitorCount = local?.monitor_count ?? 2;

  async function handleConfirmExit() {
    setIsExiting(true);
    try {
      await exitDesktopCompetition();
    } finally {
      setIsExiting(false);
      setIsConfirmingExit(false);
    }
  }

  return (
    <>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="multi-display-title"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in-50 duration-150 select-none"
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

          <div className="flex items-center justify-between border-t-2 border-border pt-4 text-xs gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">
                Detected Displays: <strong className="text-destructive font-mono">{monitorCount}</strong>
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground animate-pulse">
                Waiting for external displays to disconnect…
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsConfirmingExit(true)}
              className="flex h-8 items-center gap-1.5 px-3 pixel-flat bg-card hover:bg-destructive/15 text-destructive border border-destructive/50 transition-colors cursor-pointer text-xs font-bold shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Exit Competition</span>
            </button>
          </div>
        </div>
      </div>

      {isConfirmingExit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="multi-display-exit-title"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in-50 duration-150 select-none"
        >
          <div className="w-full max-w-md pixel-raised bg-card p-5 shadow-2xl border-4 border-destructive flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b-2 border-border pb-3">
              <div className="flex h-9 w-9 items-center justify-center pixel-flat bg-destructive text-white shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="multi-display-exit-title"
                  className="text-sm font-bold uppercase tracking-wider text-destructive"
                >
                  Exit Competition
                </h2>
                <p className="text-xs text-muted-foreground">
                  Lockdown Session Termination
                </p>
              </div>
            </div>

            <p className="text-xs text-foreground leading-relaxed">
              Are you sure you want to exit the competition? Your contest session
              will be closed, proctoring will stop cleanly, and the desktop client
              will exit.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t-2 border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmingExit(false)}
                disabled={isExiting}
                className="pixel-flat text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmExit}
                disabled={isExiting}
                className="pixel-flat text-xs font-bold"
              >
                {isExiting ? "Exiting…" : "Confirm Exit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
