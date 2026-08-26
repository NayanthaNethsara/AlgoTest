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
  X,
  XCircle,
} from "lucide-react";
import { Mascot } from "@/components/common/mascot";
import { SUBMISSION_SORT_OPTIONS } from "@/lib/constants";
import type { SubmissionItem, SubmissionSortOption } from "@/types/submission";
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

export function SubmissionsClient({
  submissions,
}: {
  submissions: SubmissionItem[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<SubmissionSortOption>("NEWEST");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (st: string) => {
    setStatusFilter(st);
    setCurrentPage(1);
  };

  const handleSortChange = (val: SubmissionSortOption) => {
    setSortBy(val);
    setCurrentPage(1);
  };

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

  const totalItems = sortedSubmissions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const paginatedSubmissions = sortedSubmissions.slice(
    (validCurrentPage - 1) * pageSize,
    validCurrentPage * pageSize,
  );

  return (
    <div className="space-y-5 font-mono">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pixel-raised bg-card p-3.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by challenge, team, or lang..."
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

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1 pixel-flat bg-muted/50 p-1">
            {["ALL", "ACCEPTED", "WRONG_ANSWER"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => handleStatusFilterChange(st)}
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

          <CustomSelect
            value={sortBy}
            onValueChange={(val) => handleSortChange(val as SubmissionSortOption)}
            options={SUBMISSION_SORT_OPTIONS}
            icon={<ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />}
            size="sm"
            aria-label="Sort submissions"
          />
        </div>
      </div>

      <div className="pixel-raised bg-card overflow-hidden">
        {totalItems === 0 ? (
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
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-black bg-muted/80 text-foreground uppercase tracking-wider font-bold">
                  <TableHead
                    onClick={() =>
                      handleSortChange(sortBy === "TITLE_ASC" ? "NEWEST" : "TITLE_ASC")
                    }
                    className="cursor-pointer hover:bg-muted"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>CHALLENGE</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead>TEAM / CONTESTANT</TableHead>
                  <TableHead>LANGUAGE</TableHead>
                  <TableHead
                    onClick={() =>
                      handleSortChange(
                        sortBy === "SCORE_DESC" ? "NEWEST" : "SCORE_DESC",
                      )
                    }
                    className="cursor-pointer hover:bg-muted"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>SCORE</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() =>
                      handleSortChange(
                        sortBy === "STATUS_ASC" ? "NEWEST" : "STATUS_ASC",
                      )
                    }
                    className="cursor-pointer hover:bg-muted"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>STATUS</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead
                    onClick={() =>
                      handleSortChange(sortBy === "NEWEST" ? "OLDEST" : "NEWEST")
                    }
                    className="text-right cursor-pointer hover:bg-muted"
                  >
                    <div className="inline-flex items-center gap-1 justify-end">
                      <span>SUBMITTED</span>
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSubmissions.map((sub, index) => {
                  const isAc =
                    sub.status.toLowerCase().includes("accepted") ||
                    sub.status.toLowerCase() === "ac";
                  const isPending =
                    sub.status.toLowerCase().includes("queued") ||
                    sub.status.toLowerCase() === "evaluating";
                  const isRejected = sub.reviewStatus === "rejected";

                  return (
                    <TableRow
                      key={sub.id || sub.submissionId || index}
                      className={isRejected ? "opacity-60" : undefined}
                    >
                      <TableCell className="font-semibold text-xs text-foreground">
                        {sub.problemTitle}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {sub.teamName}
                        </span>
                        {sub.submittedBy && (
                          <span className="text-[11px] text-muted-foreground ml-1.5">
                            ({sub.submittedBy})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] uppercase bg-muted"
                        >
                          {sub.language}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <span
                          className={isRejected ? "line-through" : undefined}
                        >
                          {sub.score} / {sub.maxScore}
                        </span>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {sub.submittedAt}
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
              pageSizeOptions={[10, 15, 25, 50]}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
