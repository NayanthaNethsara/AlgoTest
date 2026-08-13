import { getSessionUser } from "@/lib/auth/session";
import { getLeaderboardAction } from "@/actions/leaderboard";
import { LeaderboardClient } from "@/components/leaderboard/leaderboard-client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy } from "lucide-react";

export default async function LeaderboardPage() {
  const [currentUser, leaderboardData] = await Promise.all([
    getSessionUser(),
    getLeaderboardAction(),
  ]);

  return (
    <ScrollArea className="h-full">
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 p-4 sm:p-6 lg:p-8 font-pixel-body">
        {/* Sleek Page Header */}
        <div className="flex flex-col gap-1 border-b-2 border-black/40 pb-3">
          <div className="flex items-center gap-2.5">
            <Trophy className="h-5 w-5 text-amber-400" />
            <h1 className="font-pixel-header text-sm sm:text-base uppercase tracking-wider text-amber-400 pixel-text-shadow">
              LEADERBOARD
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Real-time rankings sorted by total XP scores and submission speed.
          </p>
        </div>

        {/* Clean Standings Table */}
        <LeaderboardClient leaderboard={leaderboardData} currentUser={currentUser} />
      </div>
    </ScrollArea>
  );
}
