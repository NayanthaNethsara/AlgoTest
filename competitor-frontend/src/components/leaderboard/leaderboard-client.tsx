"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLeaderboardAction } from "@/actions/leaderboard";
import {
  contestLocked,
  useProctor,
} from "@/components/portal/proctor-provider";
import { useSubmissions } from "@/components/portal/submissions-provider";
import { Badge } from "@/components/ui/badge";
import type { SessionUser } from "@/lib/auth/constants";
import {
  LEADERBOARD_POLL_INTERVAL_MS,
  LEADERBOARD_SORT_OPTIONS,
} from "@/lib/constants";
import type {
  LeaderboardEntry,
  LeaderboardSortOption,
} from "@/types/leaderboard";
import {
  ArrowUpDown,
  Clock,
  RefreshCw,
  Search,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

export function LeaderboardClient({
  leaderboard: initialLeaderboard,
  currentUser,
}: {
  leaderboard: LeaderboardEntry[];
  currentUser: SessionUser | null;
}) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<LeaderboardSortOption>("RANK_ASC");
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const proctor = useProctor();
  const locked = contestLocked(proctor);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const handleSortChange = (val: LeaderboardSortOption) => {
    setSortBy(val);
    setCurrentPage(1);
  };

  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const next = await getLeaderboardAction();
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
    const interval = setInterval(tick, LEADERBOARD_POLL_INTERVAL_MS);
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

  const totalItems = sortedLeaderboard.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const paginatedLeaderboard = sortedLeaderboard.slice(
    (validCurrentPage - 1) * pageSize,
    validCurrentPage * pageSize,
  );

  const currentUserStanding = leaderboard.find(
    (e) =>
      (currentUser?.teamId && e.teamId === currentUser.teamId) ||
      (currentUser?.teamName && e.teamName === currentUser.teamName),
  );

  return (
    <div className="space-y-5 font-mono">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pixel-raised bg-card p-3.5">
        <div className="flex flex-wrap items-center gap-3 flex-1 max-w-lg">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search teams..."
              className="w-full pixel-inset bg-background pl-8 pr-8 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <CustomSelect
            value={sortBy}
            onValueChange={(val) => handleSortChange(val as LeaderboardSortOption)}
            options={LEADERBOARD_SORT_OPTIONS}
            icon={<ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />}
            size="sm"
            aria-label="Sort leaderboard"
          />
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
            className="flex items-center gap-1.5 pixel-flat bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60 select-none"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <RefreshCw
              className={`h-3 w-3 ${refreshing ? "animate-spin text-primary" : ""}`}
            />
            <span>{refreshing ? "Syncing" : "Live"}</span>
          </button>
        </div>
      </div>

      <div className="pixel-raised bg-card overflow-hidden">
        {totalItems === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground">
            {search ? "No matching teams found." : "No standings recorded yet."}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-black bg-muted/80 text-foreground uppercase tracking-wider font-bold">
                  <TableHead
                    onClick={() =>
                      handleSortChange(
                        sortBy === "RANK_ASC" ? "SCORE_ASC" : "RANK_ASC",
                      )
                    }
                    className="w-20 text-center cursor-pointer hover:bg-muted"
                  >
                    <div className="inline-flex items-center gap-1 justify-center">
                      <span>RANK</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() =>
                      handleSortChange(
                        sortBy === "NAME_ASC" ? "RANK_ASC" : "NAME_ASC",
                      )
                    }
                    className="cursor-pointer hover:bg-muted"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>TEAM NAME</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() =>
                      handleSortChange(
                        sortBy === "SOLVED_DESC" ? "RANK_ASC" : "SOLVED_DESC",
                      )
                    }
                    className="text-center cursor-pointer hover:bg-muted"
                  >
                    <div className="inline-flex items-center gap-1 justify-center">
                      <span>SOLVED</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() =>
                      handleSortChange(
                        sortBy === "RANK_ASC" ? "SCORE_ASC" : "RANK_ASC",
                      )
                    }
                    className="text-right cursor-pointer hover:bg-muted"
                  >
                    <div className="inline-flex items-center gap-1 justify-end">
                      <span>TOTAL XP</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    <div className="inline-flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>LAST SOLVED</span>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeaderboard.map((row) => {
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
                    <TableRow
                      key={row.teamId || row.rank}
                      className={
                        isCurrentTeam
                          ? "bg-primary/20 font-bold border-l-4 border-l-primary"
                          : undefined
                      }
                    >
                      <TableCell className="text-center font-semibold">
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
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-center font-bold text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-primary" />
                          {row.problemsSolved}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold text-xs text-amber-400">
                        {row.totalScore} XP
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {row.lastSubmissionAt ? (
                          <span
                            title={`Last scoring submission: ${new Date(row.lastSubmissionAt).toLocaleString()}`}
                          >
                            {new Date(row.lastSubmissionAt).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              },
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <Pagination
              currentPage={validCurrentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
