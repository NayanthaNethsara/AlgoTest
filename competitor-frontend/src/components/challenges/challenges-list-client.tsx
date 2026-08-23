"use client";

import { useState } from "react";
import { ChallengeCard } from "@/components/challenges/challenge-card";
import { DIFFICULTY_RANKS } from "@/lib/constants";
import {
  CHALLENGE_STATUS,
  type ChallengeLayout,
  type ChallengeProgress,
  type ChallengeSortOption,
} from "@/types/challenge";
import type { Problem } from "@/types/problem";
import {
  ArrowUpDown,
  Code2,
  Grid,
  List,
  Search,
  SlidersHorizontal,
} from "lucide-react";

export function ChallengesListClient({
  problems,
  progress,
}: {
  problems: Problem[];
  progress: Record<string, ChallengeProgress>;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<ChallengeSortOption>("DEFAULT");
  const [layout, setLayout] = useState<ChallengeLayout>("grid");

  const filteredProblems = problems.filter((problem) => {
    const pProgress = (problem.id ? progress[problem.id] : undefined) ||
      (problem.slug ? progress[problem.slug] : undefined) || {
        problemId: problem.id,
        status: CHALLENGE_STATUS.NOT_ATTEMPTED,
        bestScore: 0,
      };

    if (
      search.trim() &&
      !problem.title.toLowerCase().includes(search.toLowerCase()) &&
      !problem.statement.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }

    if (statusFilter !== "ALL") {
      if (
        statusFilter === "SOLVED" &&
        pProgress.status !== CHALLENGE_STATUS.SOLVED
      )
        return false;
      if (
        statusFilter === "IN_PROGRESS" &&
        pProgress.status !== CHALLENGE_STATUS.ATTEMPTED
      )
        return false;
      if (
        statusFilter === "UNSOLVED" &&
        pProgress.status === CHALLENGE_STATUS.SOLVED
      )
        return false;
    }

    if (difficultyFilter !== "ALL") {
      if (problem.difficulty.toUpperCase() !== difficultyFilter) return false;
    }

    return true;
  });

  const sortedProblems = [...filteredProblems].sort((a, b) => {
    if (sortBy === "POINTS_DESC") return b.points - a.points;
    if (sortBy === "POINTS_ASC") return a.points - b.points;
    if (sortBy === "DIFFICULTY_ASC") {
      return (
        (DIFFICULTY_RANKS[a.difficulty.toUpperCase()] || 0) -
        (DIFFICULTY_RANKS[b.difficulty.toUpperCase()] || 0)
      );
    }
    if (sortBy === "DIFFICULTY_DESC") {
      return (
        (DIFFICULTY_RANKS[b.difficulty.toUpperCase()] || 0) -
        (DIFFICULTY_RANKS[a.difficulty.toUpperCase()] || 0)
      );
    }
    if (sortBy === "TITLE_ASC") return a.title.localeCompare(b.title);
    return 0;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3.5 pixel-raised bg-card p-3.5 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search challenges..."
            className="w-full pixel-inset bg-background pl-9 pr-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1 pixel-flat bg-muted/50 p-1">
            {["ALL", "SOLVED", "IN_PROGRESS", "UNSOLVED"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`border border-transparent px-2.5 py-1 text-[11px] uppercase font-medium transition-colors ${
                  statusFilter === st
                    ? "bg-primary font-bold text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {st.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pixel-flat bg-muted/50 p-1">
            {["ALL", "EASY", "MEDIUM", "HARD"].map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setDifficultyFilter(diff)}
                className={`border border-transparent px-2 py-1 text-[11px] uppercase font-medium transition-colors ${
                  difficultyFilter === diff
                    ? "bg-secondary font-bold text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {diff}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pixel-flat bg-card px-2.5 py-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ChallengeSortOption)}
              className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="DEFAULT">Default order</option>
              <option value="POINTS_DESC">XP: high to low</option>
              <option value="POINTS_ASC">XP: low to high</option>
              <option value="DIFFICULTY_ASC">Difficulty: easy to hard</option>
              <option value="DIFFICULTY_DESC">Difficulty: hard to easy</option>
              <option value="TITLE_ASC">Title: A to Z</option>
            </select>
          </div>

          <div className="flex items-center gap-1 pixel-flat bg-card p-1 shrink-0">
            <button
              type="button"
              onClick={() => setLayout("grid")}
              aria-label="Grid view"
              className={`p-1.5 border border-transparent transition-colors ${
                layout === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setLayout("list")}
              aria-label="List view"
              className={`p-1.5 border border-transparent transition-colors ${
                layout === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Challenges ({sortedProblems.length})
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Showing {sortedProblems.length} of {problems.length} total
          </span>
        </div>

        {sortedProblems.length === 0 ? (
          <div className="pixel-raised bg-card p-10 text-center">
            <Code2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-semibold text-sm text-foreground">
              No matching challenges found
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Try adjusting your search terms, status filters, or sort criteria
              above.
            </p>
          </div>
        ) : (
          <div
            className={
              layout === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                : "flex flex-col gap-3"
            }
          >
            {sortedProblems.map((problem) => {
              const pProgress = (problem.id
                ? progress[problem.id]
                : undefined) ||
                (problem.slug ? progress[problem.slug] : undefined) || {
                  problemId: problem.id,
                  status: CHALLENGE_STATUS.NOT_ATTEMPTED,
                  bestScore: 0,
                };

              return (
                <ChallengeCard
                  key={problem.id}
                  problem={problem}
                  layout={layout}
                  progress={{
                    problemId: problem.id,
                    status: pProgress.status || CHALLENGE_STATUS.NOT_ATTEMPTED,
                    bestScore: pProgress.bestScore ?? 0,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
