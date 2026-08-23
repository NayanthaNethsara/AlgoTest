import { getSessionUser } from "@/lib/auth/session";
import { listProblemsAction } from "@/actions/problems";
import { readProctorGate } from "@/lib/proctor-gate";
import { proctorLocksContest } from "@/lib/proctor";
import { ChallengesListClient } from "@/components/challenges/challenges-list-client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code2, Zap } from "lucide-react";
import { CHALLENGE_STATUS } from "@/types/challenge";

export default async function ChallengesPage() {
  if (proctorLocksContest(await readProctorGate())) return null;

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
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
        {/* Sleek Page Header */}
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Code2 className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">
                Challenges
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Select a challenge to inspect specs, code in the editor, and submit to earn points.
            </p>
          </div>

          {/* Compact Quest Progress Pill */}
          <div className="flex items-center gap-3 pixel-flat bg-card px-3 py-1.5 shrink-0 text-xs">
            <Zap className="h-4 w-4 text-amber-400" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">{solvedCount}/{problems.length} Solved</span>
              <span className="text-muted-foreground">•</span>
              <span className="font-bold text-amber-400">{earnedPoints}/{totalPoints} XP ({earnedPct}%)</span>
            </div>
          </div>
        </div>

        {/* Filter & Challenges Grid */}
        <ChallengesListClient problems={problems} progress={progress} />
      </div>
    </ScrollArea>
  );
}
