import { getSessionUser } from "@/lib/auth/session";
import { getLeaderboardAction } from "@/actions/leaderboard";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users } from "lucide-react";

export default async function LeaderboardPage() {
  const [currentUser, leaderboardData] = await Promise.all([
    getSessionUser(),
    getLeaderboardAction(),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      {/* Leaderboard Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h1 className="text-xl font-bold tracking-tight">Competition Leaderboard</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Real-time team standings sorted by total score (best submission per problem) and last submission time.
        </p>
      </div>

      {/* Standings Table */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        {leaderboardData.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No standings available yet. Submit solutions to appear on the leaderboard!
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground font-medium">
                <th className="p-3.5 w-16 text-center">Rank</th>
                <th className="p-3.5">Team Name</th>
                <th className="p-3.5 text-center">Solved Challenges</th>
                <th className="p-3.5 text-right">Total Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leaderboardData.map((row) => {
                const isCurrentTeam =
                  Boolean(currentUser?.teamId && row.teamId === currentUser.teamId) ||
                  Boolean(currentUser?.teamName && row.teamName === currentUser.teamName);
                const isTop1 = row.rank === 1;
                const isTop3 = row.rank <= 3;

                return (
                  <tr
                    key={row.teamId || row.rank}
                    className={`transition-colors ${
                      isCurrentTeam ? "bg-primary/5 font-semibold" : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="p-3.5 text-center font-mono font-bold">
                      {isTop1 ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 text-xs">
                          1
                        </span>
                      ) : isTop3 ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-foreground text-xs">
                          {row.rank}
                        </span>
                      ) : (
                        row.rank
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-xs text-foreground">{row.teamName}</span>
                        {isCurrentTeam && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-sans">
                            Your Team
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 text-center font-mono text-xs">
                      {row.problemsSolved}
                    </td>
                    <td className="p-3.5 text-right font-mono text-xs font-bold text-foreground">
                      {row.totalScore} pts
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
