"use client";

import { useContest } from "@/components/portal/contest-provider";
import { useProctor } from "@/components/portal/proctor-provider";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCode2,
  MessageSquare,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Trophy,
} from "lucide-react";

export function ContestWaitingRoom() {
  const { state, startsInSeconds, formattedStartsIn } = useContest();
  const proctor = useProctor();

  const isProctorConnected =
    proctor.submissionsAllowed && !proctor.code && !proctor.starting;

  const durationHours = Math.floor(state.durationSeconds / 3600);
  const durationMinutes = Math.floor((state.durationSeconds % 3600) / 60);
  const formattedDuration =
    durationHours > 0
      ? `${durationHours}h ${durationMinutes > 0 ? `${durationMinutes}m` : ""}`
      : `${durationMinutes}m`;

  return (
    <div className="flex flex-col items-center justify-center py-6 sm:py-10 max-w-3xl mx-auto w-full gap-6">
      {/* Main Hero Card */}
      <div className="w-full pixel-raised bg-card p-6 sm:p-8 flex flex-col items-center text-center gap-6">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 px-3 py-1 text-xs uppercase tracking-wider font-semibold border-primary/40 bg-primary/10 text-primary"
          >
            <Radio className="h-3.5 w-3.5 animate-pulse text-primary" />
            Waiting Room Active
          </Badge>
        </div>

        <div className="space-y-2 max-w-lg">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {state.title || "MiniAlgothon 2026"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The contest has not started yet. Problem statements and code workspaces will unlock automatically when the timer begins.
          </p>
        </div>

        {/* Live Countdown / Standby Indicator */}
        <div className="w-full max-w-md pixel-flat bg-muted/60 p-5 flex flex-col items-center gap-2 border border-border">
          {startsInSeconds > 0 ? (
            <>
              <span className="text-xs uppercase font-bold tracking-widest text-primary">
                Contest Starts In
              </span>
              <div className="font-mono text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                {formattedStartsIn}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="flex items-center gap-2 text-primary">
                <Timer className="h-5 w-5 animate-pulse" />
                <span className="text-sm font-bold uppercase tracking-wider">
                  Standing By
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Waiting for the contest administrator to begin the round.
              </span>
            </div>
          )}
        </div>

        {/* Contest Parameters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl text-left pt-2">
          <div className="pixel-flat bg-background/80 p-3.5 flex items-start gap-3 border border-border">
            <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                Duration
              </div>
              <div className="text-sm font-bold text-foreground">
                {formattedDuration}
              </div>
            </div>
          </div>

          <div className="pixel-flat bg-background/80 p-3.5 flex items-start gap-3 border border-border">
            <Trophy className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                Freeze Window
              </div>
              <div className="text-sm font-bold text-foreground">
                Final {state.freezeMinutes}m
              </div>
            </div>
          </div>

          <div className="pixel-flat bg-background/80 p-3.5 flex items-start gap-3 border border-border">
            <FileCode2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                Languages
              </div>
              <div className="text-sm font-bold text-foreground">
                C++, Python, JS
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Proctor Connection Status Card */}
      <div
        className={`w-full pixel-raised p-5 sm:p-6 border transition-colors ${
          isProctorConnected
            ? "bg-emerald-500/5 border-emerald-500/30"
            : "bg-amber-500/5 border-amber-500/30"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`p-2.5 pixel-flat shrink-0 ${
                isProctorConnected
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
            >
              {isProctorConnected ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">
                  Desktop Proctor Status:
                </span>
                <Badge
                  variant={isProctorConnected ? "success" : "warning"}
                  className="text-[10px] uppercase font-bold px-2 py-0.5"
                >
                  {isProctorConnected ? "Connected & Ready" : "Not Detected"}
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {isProctorConnected
                  ? "Your workstation desktop proctor client is active and communicating with the contest servers."
                  : "Please make sure to launch the Algothon Desktop Proctor client on your laptop before the contest starts. If you experience any technical issues launching the proctor, contact the support team in the official WhatsApp group."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Guidelines Checklist */}
      <div className="w-full pixel-raised bg-card/60 p-5 sm:p-6 border border-border space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Pre-Contest Information & Rules
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
            <span>Do not close this window. Challenges will appear automatically without manual page refresh.</span>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
            <span>Solutions are compiled and executed against hidden test cases in an isolated sandbox.</span>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
            <span>Leaderboard ranking factors total problems solved and time penalties per failed submission.</span>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
            <span>For help or urgent queries, message the organizing committee via WhatsApp.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
