"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LogOut, ShieldAlert, Trophy } from "lucide-react";
import { exitDesktopCompetition, isDesktopClient } from "@/lib/desktop";
import { Button } from "@/components/ui/button";
import { useOptionalContest } from "@/components/portal/contest-provider";

const emptySubscribe = () => () => {};

export function DesktopWindowControls({
  className,
}: {
  className?: string;
} = {}) {
  const isDesktop = useSyncExternalStore(
    emptySubscribe,
    () => isDesktopClient(),
    () => false,
  );
  const [isConfirmingExit, setIsConfirmingExit] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const contest = useOptionalContest();

  useEffect(() => {
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
    } finally {
      setIsExiting(false);
      setIsConfirmingExit(false);
    }
  }

  const contestTitle = contest?.state?.title;
  const isContestActive = contest?.isRunning || contest?.state?.status === "RUNNING";

  return (
    <>
      <div
        className={
          className ??
          "flex items-center gap-1.5 border-l-2 border-black pl-1.5 sm:pl-2.5 ml-0.5 select-none shrink-0"
        }
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
                  Exit Tournament Session
                </h2>
                <p className="text-xs text-muted-foreground">
                  Lockdown Session Termination
                </p>
              </div>
            </div>

            {contestTitle ? (
              <div className="flex flex-col gap-2.5">
                <div className="pixel-flat bg-destructive/10 border border-destructive/30 p-2.5 flex items-center gap-2 text-xs">
                  <Trophy className="h-4 w-4 text-destructive shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-destructive truncate">
                      {contestTitle}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {isContestActive
                        ? `Live contest running · ${contest.formattedRemaining} remaining`
                        : `Status: ${contest?.state?.status ?? "Enrolled"}`}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-foreground leading-relaxed">
                  You are actively enrolled in this tournament. Exiting will close
                  your workspace, disconnect your proctoring session, and lock your
                  ability to submit solutions until you relaunch the desktop client.
                </p>
              </div>
            ) : (
              <p className="text-xs text-foreground leading-relaxed">
                Are you sure you want to exit the competition? Your contest session
                will be closed, proctoring will stop cleanly, and the desktop client
                will exit.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t-2 border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmingExit(false)}
                disabled={isExiting}
                className="pixel-flat text-xs"
              >
                Stay in Contest
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

