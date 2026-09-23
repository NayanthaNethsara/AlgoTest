import { getSessionUser } from "@/lib/auth/session";
import { getLeaderboardAction } from "@/actions/leaderboard";
import { readProctorGate } from "@/lib/proctor-gate";
import { proctorLocksContest } from "@/lib/proctor";
import { LeaderboardClient } from "@/components/leaderboard/leaderboard-client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy } from "lucide-react";

export default async function LeaderboardPage() {
  if (proctorLocksContest(await readProctorGate())) return null;

  const [currentUser, leaderboardData] = await Promise.all([
    getSessionUser(),
    getLeaderboardAction(),
  ]);

  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-7">
        {/* Sleek Page Header */}
        <div className="flex flex-col gap-1 border-b-2 border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <Trophy className="h-5 w-5 text-amber-400" />
            <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
              Leaderboard
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Real-time rankings sorted by total XP scores and submission speed.
          </p>
        </div>

        {/* Clean Standings Table */}
        <LeaderboardClient
          leaderboard={leaderboardData}
          currentUser={currentUser}
        />
      </div>
    </ScrollArea>
  );
}
