"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLeaderboardAction,
  type LeaderboardEntry,
} from "@/actions/leaderboard";
import { useSubmissions } from "@/components/providers/submissions-context";
import {
  contestLocked,
  useProctor,
} from "@/components/providers/proctor-provider";
import type { SessionUser } from "@/lib/auth/constants";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpDown,
  RefreshCw,
  Search,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

type SortOption =
  | "RANK_ASC"
  | "SCORE_DESC"
  | "SCORE_ASC"
  | "SOLVED_DESC"
  | "NAME_ASC";

// Standings move when other teams score, and the submissions stream only
// carries this user's own events, so the board has to ask for itself.
const POLL_INTERVAL_MS = 10_000;

export function LeaderboardClient({
  leaderboard: initialLeaderboard,
  currentUser,
}: {
  leaderboard: LeaderboardEntry[];
  currentUser: SessionUser | null;
}) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("RANK_ASC");
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const proctor = useProctor();
  const locked = contestLocked(proctor);

  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const next = await getLeaderboardAction();
      // An empty array is also what a failed fetch returns.
      if (next.length > 0) {
        setLeaderboard(next);
        setUpdatedAt(new Date());
      }
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (locked) return;

    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, locked]);

  const { lastResult, lastReview } = useSubmissions();
  useEffect(() => {
    if (locked) return;
    if (lastResult?.submissionId || lastReview?.submissionId) void refresh();
  }, [lastResult?.submissionId, lastReview?.submissionId, refresh, locked]);

  const filteredLeaderboard = leaderboard.filter((entry) =>
    entry.teamName.toLowerCase().includes(search.toLowerCase().trim()),
  );

  const sortedLeaderboard = [...filteredLeaderboard].sort((a, b) => {
    if (sortBy === "RANK_ASC" || sortBy === "SCORE_DESC") {
      return a.rank - b.rank;
    }
    if (sortBy === "SCORE_ASC") {
      return b.rank - a.rank;
    }
    if (sortBy === "SOLVED_DESC") {
      if (b.problemsSolved !== a.problemsSolved) {
        return b.problemsSolved - a.problemsSolved;
      }
      return a.rank - b.rank;
    }
    if (sortBy === "NAME_ASC") {
      return a.teamName.localeCompare(b.teamName);
    }
    return 0;
  });

  const currentUserStanding = leaderboard.find(
    (e) =>
      (currentUser?.teamId && e.teamId === currentUser.teamId) ||
      (currentUser?.teamName && e.teamName === currentUser.teamName),
  );

  return (
    <div className="space-y-5">
      {/* Control Bar: Search, Sort & Quick Stat */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pixel-raised bg-card p-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 max-w-lg">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teams..."
              className="w-full pixel-inset bg-background pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Sort Selection */}
          <div className="flex items-center gap-1.5 pixel-flat bg-card px-2.5 py-1.5 shrink-0">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="RANK_ASC">Rank: #1 to last</option>
              <option value="SCORE_DESC">Score: high to low</option>
              <option value="SCORE_ASC">Score: low to high</option>
              <option value="SOLVED_DESC">Solved: most to least</option>
              <option value="NAME_ASC">Team: A to Z</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs shrink-0">
          {currentUserStanding && (
            <div className="flex items-center gap-2 border border-primary/60 bg-primary/10 px-2.5 py-1 text-foreground font-semibold">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span>
                Your rank: #{currentUserStanding.rank} (
                {currentUserStanding.totalScore} XP)
              </span>
            </div>
          )}
          <span className="text-muted-foreground text-xs">
            Teams:{" "}
            <strong className="text-foreground font-semibold">
              {leaderboard.length}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            title={
              updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString()} - refreshes automatically`
                : "Refreshes automatically"
            }
            className="flex items-center gap-1.5 pixel-flat bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
            />
            <span>{refreshing ? "Syncing" : "Live"}</span>
          </button>
        </div>
      </div>

      {/* Standings Table */}
      <div className="pixel-raised bg-card overflow-hidden">
        {sortedLeaderboard.length === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground">
            {search ? "No matching teams found." : "No standings recorded yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b-2 border-black bg-muted/80 text-foreground uppercase tracking-wider font-bold">
                  <th
                    onClick={() =>
                      setSortBy(
                        sortBy === "RANK_ASC" ? "SCORE_ASC" : "RANK_ASC",
                      )
                    }
                    className="py-3 px-4 w-20 text-center cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1 justify-center">
                      <span>RANK</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th
                    onClick={() =>
                      setSortBy(sortBy === "NAME_ASC" ? "RANK_ASC" : "NAME_ASC")
                    }
                    className="py-3 px-4 cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>TEAM NAME</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th
                    onClick={() =>
                      setSortBy(
                        sortBy === "SOLVED_DESC" ? "RANK_ASC" : "SOLVED_DESC",
                      )
                    }
                    className="py-3 px-4 text-center cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1 justify-center">
                      <span>SOLVED</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th
                    onClick={() =>
                      setSortBy(
                        sortBy === "RANK_ASC" ? "SCORE_ASC" : "RANK_ASC",
                      )
                    }
                    className="py-3 px-4 text-right cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1 justify-end">
                      <span>TOTAL XP</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedLeaderboard.map((row) => {
                  const isCurrentTeam =
                    Boolean(
                      currentUser?.teamId && row.teamId === currentUser.teamId,
                    ) ||
                    Boolean(
                      currentUser?.teamName &&
                      row.teamName === currentUser.teamName,
                    );
                  const isTop1 = row.rank === 1;
                  const isTop2 = row.rank === 2;
                  const isTop3 = row.rank === 3;

                  return (
                    <tr
                      key={row.teamId || row.rank}
                      className={`transition-colors ${
                        isCurrentTeam
                          ? "bg-primary/20 font-bold border-l-4 border-l-primary"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-semibold">
                        {isTop1 ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center pixel-flat bg-amber-400 text-black text-xs font-bold">
                            1
                          </span>
                        ) : isTop2 ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center pixel-flat bg-slate-300 text-black text-xs font-bold">
                            2
                          </span>
                        ) : isTop3 ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center pixel-flat bg-amber-700 text-white text-xs font-bold">
                            3
                          </span>
                        ) : (
                          <span className="font-mono text-muted-foreground">
                            #{row.rank}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-semibold text-foreground">
                            {row.teamName}
                          </span>
                          {isCurrentTeam && (
                            <Badge
                              variant="default"
                              className="text-[9px] py-0 px-1.5 font-semibold"
                            >
                              Your team
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-primary" />
                          {row.problemsSolved}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-xs text-amber-400">
                        {row.totalScore} XP
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
