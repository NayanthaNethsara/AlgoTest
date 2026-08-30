"use client";

import { useEffect, useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { exitDesktopCompetition, isDesktopClient } from "@/lib/desktop";
import { Button } from "@/components/ui/button";

export function DesktopWindowControls({
  className,
}: {
  className?: string;
} = {}) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isConfirmingExit, setIsConfirmingExit] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    setIsDesktop(isDesktopClient());

    function handleRequestExit() {
      setIsConfirmingExit(true);
    }

    window.addEventListener("minialgothon:request-exit", handleRequestExit);

    return () => {
      window.removeEventListener("minialgothon:request-exit", handleRequestExit);
    };
  }, []);

  if (!isDesktop) return null;

  async function handleConfirmExit() {
    setIsExiting(true);
    try {
      await exitDesktopCompetition();
      // If direct fetch didn't terminate the process immediately, try Tauri API invoke
      try {
        const { getCurrentWebviewWindow } = await import(
          "@tauri-apps/api/webviewWindow"
        );
        const appWindow = getCurrentWebviewWindow();
        await appWindow.close();
      } catch {
        // Ignored
      }
    } finally {
      setIsExiting(false);
      setIsConfirmingExit(false);
    }
  }

  return (
    <>
      <div
        className={
          className ??
          "flex items-center gap-1.5 border-l-2 border-black pl-1.5 sm:pl-2.5 ml-0.5 select-none shrink-0"
        }
        data-no-drag
      >
        <button
          type="button"
          id="btn-exit-competition"
          onClick={() => setIsConfirmingExit(true)}
          title="Exit Competition (Cleanly stops proctoring and closes client)"
          aria-label="Exit Competition"
          className="flex h-7 items-center gap-1.5 px-2 pixel-flat bg-card hover:bg-destructive/15 text-destructive border border-destructive/40 transition-colors cursor-pointer text-xs font-semibold"
        >
          <LogOut className="h-3.5 w-3.5 stroke-[2.5]" />
          <span className="hidden md:inline">Exit Competition</span>
        </button>
      </div>

      {isConfirmingExit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-modal-title"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 animate-in fade-in-50 duration-150 select-none"
        >
          <div className="w-full max-w-md pixel-raised bg-card p-5 shadow-2xl border-4 border-destructive flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b-2 border-border pb-3">
              <div className="flex h-9 w-9 items-center justify-center pixel-flat bg-destructive text-white shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="exit-modal-title"
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
