import { getSessionUser } from "@/lib/auth/session";
import { ChallengeCard } from "@/components/challenges/challenge-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { listProblemsAction } from "@/actions/problems";
import { Users, Trophy, Code2 } from "lucide-react";

export default async function ChallengesPage() {
  const [user, problems] = await Promise.all([getSessionUser(), listProblemsAction()]);

  const totalPoints = problems.reduce((acc, p) => acc + p.points, 0);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        {/* Welcome / Team Banner */}
        <div className="rounded-2xl border bg-gradient-to-r from-primary/10 via-card to-card p-6 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">
                  Welcome, {user?.displayName || user?.username || "Competitor"}
                </h1>
                {user?.teamName && (
                  <Badge variant="secondary" className="gap-1 font-mono text-[11px] h-6">
                    <Users className="h-3 w-3 text-primary" /> {user.teamName}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Solve coding problems to earn points for your team and climb the leaderboard.
              </p>
            </div>

            <div className="flex items-center gap-4 shrink-0 border-t pt-3 sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Code2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-sm leading-none">{problems.length}</div>
                  <span className="text-[11px] text-muted-foreground">Problems</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-sm leading-none">{totalPoints}</div>
                  <span className="text-[11px] text-muted-foreground">Total Points</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Challenge Cards List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight">Active Problems</h2>
            <span className="text-xs text-muted-foreground">{problems.length} challenges available</span>
          </div>

          {problems.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center">
              <Code2 className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
              <h3 className="font-semibold text-sm">No Active Problems</h3>
              <p className="text-xs text-muted-foreground mt-1">
                There are no published challenges available right now. Please check back later!
              </p>
            </div>
          ) : (
            problems.map((problem) => (
              <ChallengeCard key={problem.id} problem={problem} />
            ))
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
