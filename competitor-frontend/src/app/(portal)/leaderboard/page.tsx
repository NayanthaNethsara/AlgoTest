import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users } from "lucide-react";

export default async function LeaderboardPage() {
  const currentUser = await getSessionUser();

  const leaderboardData = [
    { rank: 1, teamName: currentUser?.teamName || "Alpha Coders", solved: 4, score: 400, isCurrentTeam: true },
    { rank: 2, teamName: "Byte Busters", solved: 3, score: 320, isCurrentTeam: false },
    { rank: 3, teamName: "Null Pointers", solved: 3, score: 290, isCurrentTeam: false },
    { rank: 4, teamName: "Syntax Errors", solved: 2, score: 180, isCurrentTeam: false },
    { rank: 5, teamName: "Code Ninjas", solved: 1, score: 100, isCurrentTeam: false },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      {/* Leaderboard Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h1 className="text-xl font-bold tracking-tight">Competition Leaderboard</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Real-time team standings sorted by total score and solved challenges.
        </p>
      </div>

      {/* Standings Table */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
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
              const isTop1 = row.rank === 1;
              const isTop3 = row.rank <= 3;

              return (
                <tr
                  key={row.rank}
                  className={`transition-colors ${row.isCurrentTeam ? "bg-primary/5 font-semibold" : "hover:bg-muted/30"}`}
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
                      {row.isCurrentTeam && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-sans">
                          Your Team
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3.5 text-center font-mono text-xs">
                    {row.solved}
                  </td>
                  <td className="p-3.5 text-right font-mono text-xs font-bold text-foreground">
                    {row.score} pts
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
