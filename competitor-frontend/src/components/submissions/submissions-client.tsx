"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Clock,
  History,
  Search,
  XCircle,
} from "lucide-react";
import { Mascot } from "@/components/common/mascot";
import type { SubmissionItem, SubmissionSortOption } from "@/types/submission";

export function SubmissionsClient({
  submissions,
}: {
  submissions: SubmissionItem[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<SubmissionSortOption>("NEWEST");

  const filteredSubmissions = submissions.filter((sub) => {
    if (
      search.trim() &&
      !sub.problemTitle.toLowerCase().includes(search.toLowerCase()) &&
      !sub.teamName.toLowerCase().includes(search.toLowerCase()) &&
      !sub.language.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }

    if (statusFilter !== "ALL") {
      const isAc =
        sub.status.toLowerCase().includes("accepted") ||
        sub.status.toLowerCase() === "ac";
      const isWa =
        sub.status.toLowerCase().includes("wrong") ||
        sub.status.toLowerCase() === "wa";
      if (statusFilter === "ACCEPTED" && !isAc) return false;
      if (statusFilter === "WRONG_ANSWER" && !isWa) return false;
      if (statusFilter === "OTHER" && (isAc || isWa)) return false;
    }

    return true;
  });

  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    if (sortBy === "NEWEST") return (b.timestamp ?? 0) - (a.timestamp ?? 0);
    if (sortBy === "OLDEST") return (a.timestamp ?? 0) - (b.timestamp ?? 0);
    if (sortBy === "SCORE_DESC") return b.score - a.score;
    if (sortBy === "STATUS_ASC") return a.status.localeCompare(b.status);
    if (sortBy === "TITLE_ASC")
      return a.problemTitle.localeCompare(b.problemTitle);
    return 0;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pixel-raised bg-card p-3.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by challenge, team, or lang..."
            className="w-full pixel-inset bg-background pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1 pixel-flat bg-muted/50 p-1">
            {["ALL", "ACCEPTED", "WRONG_ANSWER"].map((st) => (
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

          <div className="flex items-center gap-1.5 pixel-flat bg-card px-2.5 py-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as SubmissionSortOption)
              }
              className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
            >
              <option value="NEWEST">Newest first</option>
              <option value="OLDEST">Oldest first</option>
              <option value="SCORE_DESC">Score: highest first</option>
              <option value="STATUS_ASC">Status: verdict A-Z</option>
              <option value="TITLE_ASC">Challenge: A to Z</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pixel-raised bg-card overflow-hidden">
        {sortedSubmissions.length === 0 ? (
          <div className="p-10 text-center">
            {search ? (
              <History className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            ) : (
              <Mascot variant="muted" size={56} className="mx-auto mb-3" />
            )}
            <h3 className="font-semibold text-sm text-foreground">
              {search ? "No matching submissions found" : "No submissions yet"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              {search
                ? "Try a different challenge, team, or language."
                : "Submit a solution to a challenge and it'll show up here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b-2 border-black bg-muted/80 text-foreground uppercase tracking-wider font-bold">
                  <th
                    onClick={() =>
                      setSortBy(sortBy === "TITLE_ASC" ? "NEWEST" : "TITLE_ASC")
                    }
                    className="py-3 px-4 cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>CHALLENGE</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th className="py-3 px-4">TEAM / CONTESTANT</th>
                  <th className="py-3 px-4">LANGUAGE</th>
                  <th
                    onClick={() =>
                      setSortBy(
                        sortBy === "SCORE_DESC" ? "NEWEST" : "SCORE_DESC",
                      )
                    }
                    className="py-3 px-4 cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>SCORE</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th
                    onClick={() =>
                      setSortBy(
                        sortBy === "STATUS_ASC" ? "NEWEST" : "STATUS_ASC",
                      )
                    }
                    className="py-3 px-4 cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>STATUS</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th
                    onClick={() =>
                      setSortBy(sortBy === "NEWEST" ? "OLDEST" : "NEWEST")
                    }
                    className="py-3 px-4 text-right cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1 justify-end">
                      <span>SUBMITTED</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedSubmissions.map((sub) => {
                  const isAc =
                    sub.status.toLowerCase().includes("accepted") ||
                    sub.status.toLowerCase() === "ac";
                  const isPending =
                    sub.status.toLowerCase().includes("queued") ||
                    sub.status.toLowerCase() === "evaluating";
                  const isRejected = sub.reviewStatus === "rejected";

                  return (
                    <tr
                      key={sub.id}
                      className={`hover:bg-muted/40 transition-colors ${isRejected ? "opacity-60" : ""}`}
                    >
                      <td className="py-3 px-4 font-semibold text-xs text-foreground">
                        {sub.problemTitle}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {sub.teamName}
                        </span>
                        {sub.submittedBy && (
                          <span className="text-[11px] text-muted-foreground ml-1.5">
                            ({sub.submittedBy})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] uppercase bg-muted"
                        >
                          {sub.language}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        <span
                          className={isRejected ? "line-through" : undefined}
                        >
                          {sub.score} / {sub.maxScore}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant={
                              isAc
                                ? "success"
                                : isPending
                                  ? "warning"
                                  : "destructive"
                            }
                            className={`gap-1.5 text-[10px] uppercase font-bold ${isPending ? "animate-pulse" : ""}`}
                          >
                            {isAc ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : isPending ? (
                              <Clock className="h-3 w-3 pixel-spin" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {sub.status}
                          </Badge>
                          {isRejected && (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[9px] uppercase font-bold"
                              title={
                                sub.reviewReason || "Rejected by an organizer"
                              }
                            >
                              <Ban className="h-3 w-3" />
                              Not counted
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-muted-foreground">
                        {sub.submittedAt}
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
