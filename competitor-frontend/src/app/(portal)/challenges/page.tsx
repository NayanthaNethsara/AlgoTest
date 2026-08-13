import { getSessionUser } from "@/lib/auth/session";
import { listProblemsAction } from "@/actions/problems";
import { ChallengesListClient } from "@/components/challenges/challenges-list-client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Code2, ShieldCheck, Trophy, Users, Zap } from "lucide-react";
import { CHALLENGE_STATUS } from "@/types/challenge";

export default async function ChallengesPage() {
  const [user, { problems, progress }] = await Promise.all([
    getSessionUser(),
    listProblemsAction(),
  ]);

  const totalPoints = problems.reduce((acc, p) => acc + p.points, 0);
  const solvedCount = problems.filter((p) => {
    const pr = (p.id ? progress[p.id] : undefined) || (p.slug ? progress[p.slug] : undefined);
    return pr?.status === CHALLENGE_STATUS.SOLVED;
  }).length;

  const earnedPoints = Object.values(progress).reduce(
    (acc, pr) => acc + (pr.bestScore ?? 0),
    0
  );

  const earnedPct = totalPoints > 0 ? Math.min(100, Math.round((earnedPoints / totalPoints) * 100)) : 0;

  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-[1550px] mx-auto flex flex-col gap-6 p-4 sm:p-6 lg:p-8 font-pixel-body">
        {/* Arcade Quest Hero Banner & Stats */}
        <div className="border-2 border-black bg-card p-6 shadow-[inset_2px_2px_0px_var(--bevel-light),inset_-2px_-2px_0px_var(--bevel-dark),0px_4px_0px_#000000]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Greeting & Team info */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-pixel-header text-base sm:text-lg lg:text-xl uppercase tracking-wider text-foreground pixel-text-shadow">
                  CONTEST QUEST HUB
                </h1>
                {user?.teamName ? (
                  <Badge variant="secondary" className="gap-1.5 font-pixel-body text-xs h-7 px-3 border-black bg-muted">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span className="font-bold text-foreground uppercase">{user.teamName}</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground h-7 font-pixel-body">
                    NO TEAM
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1.5 border-emerald-500/60 bg-emerald-950/80 text-emerald-300 text-xs h-7 px-3">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  CONTEST ACTIVE
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-2xl">
                Welcome, <strong className="text-foreground uppercase">{user?.displayName || user?.username || "Competitor"}</strong>. Select a challenge to inspect problem specs, write solutions in the built-in editor, and submit to earn team points.
              </p>
            </div>

            {/* Overall XP Progress Bar */}
            <div className="flex flex-col gap-2 min-w-[260px] border-t-2 border-black/40 pt-4 lg:border-t-0 lg:border-l-2 lg:pl-6 lg:pt-0">
              <div className="flex items-center justify-between text-xs font-pixel-body font-bold">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-400" /> QUEST PROGRESS
                </span>
                <span className="text-primary">{earnedPct}% COMPLETED</span>
              </div>
              <div className="h-4 w-full border-2 border-black bg-input p-0.5 shadow-[inset_2px_2px_0px_var(--edge)]">
                <div
                  className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-300 shadow-[inset_1px_1px_0px_rgba(255,255,255,0.4)]"
                  style={{ width: `${earnedPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{solvedCount} of {problems.length} Solved</span>
                <span className="text-amber-400 font-bold">{earnedPoints} / {totalPoints} XP</span>
              </div>
            </div>
          </div>

          {/* Quick Stat Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 border-t-2 border-black/40 pt-5">
            <div className="flex items-center gap-3 border-2 border-black bg-muted/40 p-3 shadow-[inset_1.5px_1.5px_0px_var(--bevel-light),inset_-1.5px_-1.5px_0px_var(--bevel-dark)]">
              <div className="flex h-9 w-9 items-center justify-center border-2 border-black bg-primary/20 text-primary shrink-0">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-pixel-header text-sm text-foreground">{problems.length}</div>
                <span className="text-[11px] text-muted-foreground uppercase">Challenges</span>
              </div>
            </div>

            <div className="flex items-center gap-3 border-2 border-black bg-muted/40 p-3 shadow-[inset_1.5px_1.5px_0px_var(--bevel-light),inset_-1.5px_-1.5px_0px_var(--bevel-dark)]">
              <div className="flex h-9 w-9 items-center justify-center border-2 border-black bg-emerald-950 text-emerald-400 shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-pixel-header text-sm text-foreground">{solvedCount}</div>
                <span className="text-[11px] text-muted-foreground uppercase">Solved</span>
              </div>
            </div>

            <div className="flex items-center gap-3 border-2 border-black bg-muted/40 p-3 shadow-[inset_1.5px_1.5px_0px_var(--bevel-light),inset_-1.5px_-1.5px_0px_var(--bevel-dark)]">
              <div className="flex h-9 w-9 items-center justify-center border-2 border-black bg-amber-950 text-amber-400 shrink-0">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <div className="font-pixel-header text-sm font-bold text-amber-400">{earnedPoints}</div>
                <span className="text-[11px] text-muted-foreground uppercase">XP Earned</span>
              </div>
            </div>

            <div className="flex items-center gap-3 border-2 border-black bg-muted/40 p-3 shadow-[inset_1.5px_1.5px_0px_var(--bevel-light),inset_-1.5px_-1.5px_0px_var(--bevel-dark)]">
              <div className="flex h-9 w-9 items-center justify-center border-2 border-black bg-secondary text-secondary-foreground shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="font-pixel-header text-xs text-foreground uppercase truncate max-w-[100px]">
                  {user?.teamName || "Solo"}
                </div>
                <span className="text-[11px] text-muted-foreground uppercase">Team Unit</span>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Challenges List & Filter Grid */}
        <ChallengesListClient problems={problems} progress={progress} />
      </div>
    </ScrollArea>
  );
}
