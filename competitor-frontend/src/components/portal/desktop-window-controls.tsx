"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, LogOut, Power, ShieldAlert, X } from "lucide-react";
import { leaveContestAction } from "@/actions/telemetry";
import { Button } from "@/components/ui/button";
import { isDesktopClient } from "@/lib/desktop";

export function DesktopWindowControls({
  className,
}: {
  className?: string;
} = {}) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    setIsDesktop(isDesktopClient());
  }, []);

  const handleRequestExit = async () => {
    // 1. Ask native Tauri shell to show native modal confirmation dialog
    try {
      if (typeof window !== "undefined" && (window as any).__TAURI__?.core?.invoke) {
        await (window as any).__TAURI__.core.invoke("close_window");
        return;
      }
    } catch {}

    try {
      await fetch("http://127.0.0.1:47620/request-exit", {
        method: "POST",
        mode: "no-cors",
      });
    } catch {
      // Loopback unreachable - only show web modal as last resort
      setShowExitConfirm(true);
    }
  };

  const handleConfirmLeave = async () => {
    setIsLeaving(true);
    try {
      // 1. Inform backend to lock contestant session until admin re-admission
      await leaveContestAction();
    } catch {
      // Best-effort
    }

    // 2. Instruct native desktop shell to exit cleanly
    try {
      await fetch("http://127.0.0.1:47620/quit", {
        method: "POST",
        mode: "no-cors",
      });
    } catch {
      if (typeof window !== "undefined") {
        window.close();
      }
    }
  };

  if (!isDesktop) return null;

  return (
    <>
      <div
        className={
          className ??
          "flex items-center gap-1 border-l-2 border-black pl-1.5 sm:pl-2.5 ml-0.5 select-none shrink-0"
        }
        data-no-drag
      >
        <button
          type="button"
          id="titlebar-leave-contest"
          onClick={handleRequestExit}
          title="Leave Competition (Locks session until Admin re-admission)"
          aria-label="Leave Competition"
          className="flex h-7 items-center gap-1.5 px-2.5 pixel-flat bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-bold text-xs cursor-pointer shadow-sm"
        >
          <LogOut className="h-3.5 w-3.5 stroke-[2.5]" />
          <span className="hidden sm:inline">Leave Contest</span>
        </button>

        <button
          type="button"
          id="titlebar-close-direct"
          onClick={handleRequestExit}
          title="Close / Exit Contest App"
          aria-label="Close / Exit App"
          className="flex h-7 w-7 items-center justify-center pixel-flat bg-card hover:bg-destructive hover:text-white text-muted-foreground transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5 stroke-[2.5]" />
        </button>
      </div>

      {showExitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 select-none"
        >
          <div className="pixel-raised flex w-full max-w-md flex-col gap-5 border-2 border-destructive bg-card p-6 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-100">
            <div className="flex items-center gap-3.5 border-b-2 border-destructive/40 pb-4">
              <div className="p-2.5 bg-destructive/15 text-destructive pixel-flat">
                <ShieldAlert className="size-6 text-destructive animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-bold text-destructive">
                  Leave Competition?
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Exiting desktop lockdown will lock your account
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-xs text-muted-foreground leading-relaxed">
              <p>
                Are you sure you want to leave the competition and exit the desktop application?
              </p>
              <div className="bg-destructive/10 border border-destructive/30 p-3 pixel-flat text-xs text-destructive font-medium space-y-1">
                <p className="font-bold">Important Notice:</p>
                <p>
                  Exiting will close your session and lock your submissions. You will
                  <strong className="font-bold"> not</strong> be able to re-enter until a contest
                  administrator explicitly grants you re-admission from the Admin Console.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t-2 border-border pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={isLeaving}
                onClick={() => setShowExitConfirm(false)}
                className="h-9 text-xs font-semibold cursor-pointer"
              >
                Cancel &amp; Stay
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isLeaving}
                onClick={handleConfirmLeave}
                className="h-9 text-xs font-bold bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
              >
                {isLeaving ? (
                  "Exiting App..."
                ) : (
                  <>
                    <Power className="size-3.5 mr-1.5" />
                    Confirm &amp; Leave
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
