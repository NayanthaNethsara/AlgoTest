"use client";

import { useState } from "react";
import { ChallengeCard } from "@/components/challenges/challenge-card";
import { CHALLENGE_STATUS, type ChallengeProgress } from "@/types/challenge";
import type { Problem } from "@/types/problem";
import { Code2, Grid, List, Search, SlidersHorizontal } from "lucide-react";

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
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  const filteredProblems = problems.filter((problem) => {
    const pProgress =
      (problem.id ? progress[problem.id] : undefined) ||
      (problem.slug ? progress[problem.slug] : undefined) || {
        problemId: problem.id,
        status: CHALLENGE_STATUS.NOT_ATTEMPTED,
        bestScore: 0,
      };

    // Search filter
    if (
      search.trim() &&
      !problem.title.toLowerCase().includes(search.toLowerCase()) &&
      !problem.statement.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }

    // Status filter
    if (statusFilter !== "ALL") {
      if (statusFilter === "SOLVED" && pProgress.status !== CHALLENGE_STATUS.SOLVED) return false;
      if (statusFilter === "IN_PROGRESS" && pProgress.status !== CHALLENGE_STATUS.ATTEMPTED) return false;
      if (statusFilter === "UNSOLVED" && pProgress.status === CHALLENGE_STATUS.SOLVED) return false;
    }

    // Difficulty filter
    if (difficultyFilter !== "ALL") {
      if (problem.difficulty.toUpperCase() !== difficultyFilter) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Control Bar: Search, Filters, Layout Toggle */}
      <div className="flex flex-col gap-4 border-2 border-black bg-card p-4 shadow-[inset_2px_2px_0px_var(--bevel-light),inset_-2px_-2px_0px_var(--bevel-dark),0px_4px_0px_#000000] lg:flex-row lg:items-center lg:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search challenges by title or keyword..."
            className="w-full border-2 border-black bg-background pl-9 pr-4 py-2 font-pixel-body text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Filters & View Toggle */}
        <div className="flex flex-wrap items-center gap-3 font-pixel-body text-xs">
          {/* Status Filter */}
          <div className="flex items-center gap-1 border-2 border-black bg-muted/50 p-1">
            {["ALL", "SOLVED", "IN_PROGRESS", "UNSOLVED"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`border px-2.5 py-1 text-[11px] uppercase transition-all ${
                  statusFilter === st
                    ? "border-black bg-primary font-bold text-primary-foreground shadow-[inset_1.5px_1.5px_0px_rgba(255,255,255,0.4)]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {st.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Difficulty Filter */}
          <div className="flex items-center gap-1 border-2 border-black bg-muted/50 p-1">
            {["ALL", "EASY", "MEDIUM", "HARD"].map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setDifficultyFilter(diff)}
                className={`border px-2 py-1 text-[11px] uppercase transition-all ${
                  difficultyFilter === diff
                    ? "border-black bg-secondary font-bold text-secondary-foreground shadow-[inset_1.5px_1.5px_0px_rgba(255,255,255,0.4)]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {diff}
              </button>
            ))}
          </div>

          {/* Grid vs List Toggle */}
          <div className="flex items-center gap-1 border-2 border-black bg-card p-1 shrink-0">
            <button
              type="button"
              onClick={() => setLayout("grid")}
              aria-label="Grid view"
              className={`p-1.5 border transition-all ${
                layout === "grid"
                  ? "border-black bg-primary text-primary-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setLayout("list")}
              aria-label="List view"
              className={`p-1.5 border transition-all ${
                layout === "list"
                  ? "border-black bg-primary text-primary-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Challenge List / Grid */}
      <div>
        <div className="flex items-center justify-between mb-3 font-pixel-body">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Challenges ({filteredProblems.length})
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Showing {filteredProblems.length} of {problems.length} total
          </span>
        </div>

        {filteredProblems.length === 0 ? (
          <div className="border-2 border-black bg-card p-12 text-center shadow-[inset_2px_2px_0px_var(--bevel-light),inset_-2px_-2px_0px_var(--bevel-dark),0px_4px_0px_#000000] font-pixel-body">
            <Code2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-bold text-sm uppercase text-foreground">No matching challenges found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Try adjusting your search terms or status and difficulty filters above.
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
            {filteredProblems.map((problem) => {
              const pProgress =
                (problem.id ? progress[problem.id] : undefined) ||
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
                    status: (pProgress.status as any) || CHALLENGE_STATUS.NOT_ATTEMPTED,
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
