"use client";

import { useState } from "react";
import { ShieldAlert, Trophy } from "lucide-react";
import { exitDesktopCompetition } from "@/lib/desktop";
import { Button } from "@/components/ui/button";
import { useOptionalContest } from "@/components/portal/contest-provider";

export function ExitCompetitionModal({
  open,
  onOpenChange,
  dialogTitle = "Exit Tournament Session",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogTitle?: string;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const contest = useOptionalContest();

  if (!open) return null;

  async function handleConfirmExit() {
    setIsExiting(true);
    try {
      await exitDesktopCompetition();
    } finally {
      setIsExiting(false);
      onOpenChange(false);
    }
  }

  const contestTitle = contest?.state?.title;
  const isContestActive =
    contest?.isRunning || contest?.state?.status === "RUNNING";

  return (
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
              {dialogTitle}
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
            onClick={() => onOpenChange(false)}
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
  );
}
