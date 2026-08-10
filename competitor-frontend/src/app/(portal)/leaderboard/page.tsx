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
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 font-pixel-body">
      {/* Leaderboard Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <Trophy className="h-6 w-6 text-amber-400" />
          <h1 className="text-sm font-pixel-header uppercase tracking-wider text-amber-400 pixel-text-shadow">
            LEADERBOARD STANDINGS
          </h1>
        </div>
        <p className="text-xs text-muted-foreground font-pixel-body">
          REAL-TIME RANKINGS SORTED BY TOTAL XP SCORES AND SUBMISSION SPEED.
        </p>
      </div>

      {/* Standings Table */}
      <div className="border-4 border-black bg-card shadow-[inset_3px_3px_0px_oklch(0.45_0.02_260),inset_-3px_-3px_0px_oklch(0.12_0.01_260),0px_6px_0px_#000000] overflow-hidden">
        {leaderboardData.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground font-pixel-body uppercase">
            NO STANDINGS RECORDED YET. SOLVE QUESTS TO CLAIM HIGH SCORES!
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs font-pixel-body">
            <thead>
              <tr className="border-b-2 border-black bg-muted text-foreground uppercase tracking-wider font-bold">
                <th className="p-3.5 w-16 text-center">RANK</th>
                <th className="p-3.5">GUILD / TEAM</th>
                <th className="p-3.5 text-center">QUESTS SOLVED</th>
                <th className="p-3.5 text-right">TOTAL XP</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black">
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
                      isCurrentTeam ? "bg-primary/20 font-bold" : "hover:bg-muted/40"
                    }`}
                  >
                    <td className="p-3.5 text-center font-bold">
                      {isTop1 ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center border-2 border-black bg-amber-400 text-black text-xs font-pixel-header font-bold shadow-[inset_1px_1px_0px_#ffffff]">
                          1
                        </span>
                      ) : isTop3 ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center border border-black bg-slate-300 text-black text-xs font-bold">
                          {row.rank}
                        </span>
                      ) : (
                        `#${row.rank}`
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="font-bold text-xs uppercase text-foreground">{row.teamName}</span>
                        {isCurrentTeam && (
                          <Badge variant="secondary" className="text-[9px] py-0 px-1.5 border-black bg-primary text-primary-foreground font-pixel-body uppercase">
                            YOUR TEAM
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 text-center font-bold text-xs">
                      {row.problemsSolved}
                    </td>
                    <td className="p-3.5 text-right font-bold text-xs text-amber-400">
                      {row.totalScore} XP
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
