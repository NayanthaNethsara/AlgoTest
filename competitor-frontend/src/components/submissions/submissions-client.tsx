"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, CheckCircle2, Clock, History, Search, XCircle } from "lucide-react";

export type SubmissionItem = {
  id: string;
  problemTitle: string;
  submittedBy: string;
  teamName: string;
  language: string;
  execTime: string;
  status: string;
  submittedAt: string;
  timestamp?: number;
};

type SortOption = "NEWEST" | "OLDEST" | "TIME_ASC" | "STATUS_ASC" | "TITLE_ASC";

export function SubmissionsClient({
  submissions,
}: {
  submissions: SubmissionItem[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("NEWEST");

  const filteredSubmissions = submissions.filter((sub) => {
    // Search filter
    if (
      search.trim() &&
      !sub.problemTitle.toLowerCase().includes(search.toLowerCase()) &&
      !sub.teamName.toLowerCase().includes(search.toLowerCase()) &&
      !sub.language.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }

    // Status filter
    if (statusFilter !== "ALL") {
      const isAc = sub.status.toLowerCase().includes("accepted") || sub.status.toLowerCase() === "ac";
      const isWa = sub.status.toLowerCase().includes("wrong") || sub.status.toLowerCase() === "wa";
      if (statusFilter === "ACCEPTED" && !isAc) return false;
      if (statusFilter === "WRONG_ANSWER" && !isWa) return false;
      if (statusFilter === "OTHER" && (isAc || isWa)) return false;
    }

    return true;
  });

  const parseExecTimeMs = (t: string): number => {
    const num = parseInt(t, 10);
    return isNaN(num) ? 999999 : num;
  };

  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    if (sortBy === "NEWEST") return (b.timestamp ?? 0) - (a.timestamp ?? 0);
    if (sortBy === "OLDEST") return (a.timestamp ?? 0) - (b.timestamp ?? 0);
    if (sortBy === "TIME_ASC") return parseExecTimeMs(a.execTime) - parseExecTimeMs(b.execTime);
    if (sortBy === "STATUS_ASC") return a.status.localeCompare(b.status);
    if (sortBy === "TITLE_ASC") return a.problemTitle.localeCompare(b.problemTitle);
    return 0;
  });

  return (
    <div className="space-y-5 font-pixel-body">
      {/* Control Bar: Search, Status Filter, Sort */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-2 border-black bg-card p-3 shadow-[inset_2px_2px_0px_var(--bevel-light),inset_-2px_-2px_0px_var(--bevel-dark),0px_3px_0px_#000000]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by challenge, team, or lang..."
            className="w-full border-2 border-black bg-background pl-8 pr-3 py-1.5 font-pixel-body text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 border-2 border-black bg-muted/50 p-1">
            {["ALL", "ACCEPTED", "WRONG_ANSWER"].map((st) => (
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

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 border-2 border-black bg-card px-2.5 py-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent font-pixel-body text-xs uppercase text-foreground focus:outline-none cursor-pointer"
            >
              <option value="NEWEST">Newest First</option>
              <option value="OLDEST">Oldest First</option>
              <option value="TIME_ASC">Exec Time: Fastest</option>
              <option value="STATUS_ASC">Status: Verdict A-Z</option>
              <option value="TITLE_ASC">Challenge: A to Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="border-2 border-black bg-card shadow-[inset_2px_2px_0px_var(--bevel-light),inset_-2px_-2px_0px_var(--bevel-dark),0px_4px_0px_#000000] overflow-hidden">
        {sortedSubmissions.length === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground uppercase">
            {search ? "No matching submissions found." : "No submission history recorded yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b-2 border-black bg-muted/80 text-foreground uppercase tracking-wider font-bold">
                  <th
                    onClick={() => setSortBy(sortBy === "TITLE_ASC" ? "NEWEST" : "TITLE_ASC")}
                    className="py-3 px-4 cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>CHALLENGE</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th className="py-3 px-4">TEAM / CONTESTANT</th>
                  <th className="py-3 px-4">LANG</th>
                  <th
                    onClick={() => setSortBy(sortBy === "TIME_ASC" ? "NEWEST" : "TIME_ASC")}
                    className="py-3 px-4 cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>EXEC TIME</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th
                    onClick={() => setSortBy(sortBy === "STATUS_ASC" ? "NEWEST" : "STATUS_ASC")}
                    className="py-3 px-4 cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>STATUS</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                  <th
                    onClick={() => setSortBy(sortBy === "NEWEST" ? "OLDEST" : "NEWEST")}
                    className="py-3 px-4 text-right cursor-pointer hover:bg-muted select-none"
                  >
                    <div className="inline-flex items-center gap-1 justify-end">
                      <span>SUBMITTED</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y border-black/40">
                {sortedSubmissions.map((sub) => {
                  const isAc = sub.status.toLowerCase().includes("accepted") || sub.status.toLowerCase() === "ac";
                  const isPending = sub.status.toLowerCase().includes("queued") || sub.status.toLowerCase().includes("evaluating");

                  return (
                    <tr key={sub.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-xs text-foreground uppercase">
                        {sub.problemTitle}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground uppercase">
                        <span className="font-semibold text-foreground">{sub.teamName}</span>
                        {sub.submittedBy && (
                          <span className="text-[11px] text-muted-foreground ml-1.5">({sub.submittedBy})</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <Badge variant="outline" className="font-mono text-[10px] uppercase border-black bg-muted">
                          {sub.language}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {sub.execTime}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant="secondary"
                          className={`gap-1.5 text-[10px] uppercase border font-pixel-body font-bold ${
                            isAc
                              ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                              : isPending
                              ? "bg-amber-950 text-amber-300 border-amber-500 animate-pulse"
                              : "bg-rose-950 text-rose-300 border-rose-500"
                          }`}
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
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-muted-foreground uppercase">
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
