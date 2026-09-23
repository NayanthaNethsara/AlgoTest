"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckCircle2Icon,
  ClockIcon,
  EyeIcon,
  HistoryIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  Undo2Icon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  listAdminSubmissionsAction,
  getAdminSubmissionAction,
  rejudgeSubmissionAction,
  reviewSubmissionAction,
  unstickTeamAction,
} from "@/lib/actions/submissions";
import type { AdminSubmission, SubmissionCounts } from "@/types/submission";
import { getErrorMessage } from "@/lib/errors";
import { useAsyncData } from "@/hooks/use-async-data";
import { useServerPagination } from "@/hooks/use-pagination";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataPagination } from "@/components/shell/data-pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shell/data-states";
import { PageHeader, PageShell } from "@/components/shell/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
];

const NO_SUBMISSIONS: AdminSubmission[] = [];

type SubmissionsPageData = {
  submissions: AdminSubmission[];
  total: number;
  counts: SubmissionCounts;
};

const EMPTY_COUNTS: SubmissionCounts = {
  queued: 0,
  running: 0,
  passed: 0,
  failed: 0,
  rejected: 0,
};

const EMPTY_PAGE_DATA: SubmissionsPageData = {
  submissions: NO_SUBMISSIONS,
  total: 0,
  counts: EMPTY_COUNTS,
};

export default function AdminSubmissionsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loader = useCallback(async (): Promise<SubmissionsPageData> => {
    const offset = (page - 1) * pageSize;
    const res = await listAdminSubmissionsAction(
      statusFilter === "all" ? "" : statusFilter,
      "",
      "",
      pageSize,
      offset
    );
    return {
      submissions: res.submissions || NO_SUBMISSIONS,
      total: res.total || 0,
      counts: res.counts || EMPTY_COUNTS,
    };
  }, [statusFilter, page, pageSize]);

  const {
    data,
    error,
    loading,
    refreshing,
    refresh,
  } = useAsyncData(loader, EMPTY_PAGE_DATA, "Failed to load submissions.");

  const [selectedSubmission, setSelectedSubmission] = useState<AdminSubmission | null>(null);
  const [reviewTarget, setReviewTarget] = useState<AdminSubmission | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [unstickTarget, setUnstickTarget] = useState<AdminSubmission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const submissions = data.submissions;
  const counts = data.counts;

  const pagination = useServerPagination({
    items: data.submissions,
    total: data.total,
    page,
    pageSize,
    onPageChange: setPage,
    onPageSizeChange: (size) => {
      setPageSize(size);
      setPage(1);
    },
  });

  async function inspectSubmission(sub: AdminSubmission) {
    setSelectedSubmission(sub);
    const full = await getAdminSubmissionAction(sub.submissionId);
    if (full) {
      setSelectedSubmission((prev) =>
        prev?.submissionId === full.submissionId ? full : prev
      );
    }
  }

  async function handleRejudge(sub: AdminSubmission) {
    setBusyId(sub.submissionId);
    try {
      const res = await rejudgeSubmissionAction(sub.submissionId);
      if (!res.success) throw new Error(res.error);
      toast.success("Re-queued for judging", { description: sub.submissionId.slice(0, 8) });
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to re-judge the submission."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!reviewTarget || !reviewReason.trim()) return;
    setReviewing(true);
    try {
      const res = await reviewSubmissionAction(
        reviewTarget.submissionId,
        "rejected",
        reviewReason.trim()
      );
      if (!res.success) throw new Error(res.error);
      setReviewTarget(null);
      setReviewReason("");
      toast.success("Submission rejected", {
        description: "The team's best score for this problem was recomputed.",
      });
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to reject the submission."));
    } finally {
      setReviewing(false);
    }
  }

  async function handleRestore(sub: AdminSubmission) {
    setBusyId(sub.submissionId);
    try {
      const res = await reviewSubmissionAction(sub.submissionId, "accepted", "");
      if (!res.success) throw new Error(res.error);
      toast.success("Submission restored", {
        description: "It counts towards the leaderboard again.",
      });
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to restore the submission."));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmUnstick() {
    if (!unstickTarget) return;
    const target = unstickTarget;
    const teamName = target.teamName || target.userName;
    setUnstickTarget(null);
    setBusyId(target.submissionId);
    try {
      const res = await unstickTeamAction(target.teamId);
      if (!res.success) throw new Error(res.error);
      toast.success("Submission locks cleared", { description: teamName });
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to clear the submission lock."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title="Submissions & judge monitor"
        description="Inspect execution logs, re-judge stuck tasks, and manage team submission locks."
        actions={
          <>
            <SimpleSelect
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              aria-label="Filter by status"
              className="w-36 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              {refreshing ? <Spinner /> : <RefreshCwIcon />} Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Queued"
          value={counts.queued}
          icon={<ClockIcon className="size-4 text-warning" />}
          loading={loading}
        />
        <MetricCard
          label="Running"
          value={counts.running}
          icon={<PlayIcon className="size-4 text-primary" />}
          loading={loading}
        />
        <MetricCard
          label="Passed"
          value={counts.passed}
          icon={<CheckCircle2Icon className="size-4 text-success" />}
          valueClassName="text-success"
          loading={loading}
        />
        <MetricCard
          label="Failed / errors"
          value={counts.failed}
          icon={<XCircleIcon className="size-4 text-destructive" />}
          valueClassName="text-destructive"
          hint={`${counts.rejected} rejected by an organizer`}
          loading={loading}
        />
      </div>

      {loading ? (
        <TableSkeleton columns={7} />
      ) : error && submissions.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          title="No submissions"
          description={
            statusFilter === "all"
              ? "Nothing has been submitted yet."
              : `No submission currently has the "${statusFilter}" status.`
          }
          action={
            statusFilter !== "all" ? (
              <Button variant="outline" size="sm" onClick={() => setStatusFilter("all")}>
                Show all statuses
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>ID</TableHead>
                <TableHead>Competitor / team</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Lang</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items.map((sub) => {
                const rejected = sub.reviewStatus === "rejected";
                const busy = busyId === sub.submissionId;

                return (
                  <TableRow key={sub.submissionId} className={cn(rejected && "opacity-60")}>
                    <TableCell className="font-mono text-xs font-semibold">
                      {sub.submissionId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <div className="truncate text-xs font-medium">
                        {sub.teamName || sub.userName}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {sub.userName}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-xs font-medium">
                      {sub.problemTitle || sub.problemId}
                    </TableCell>
                    <TableCell className="font-mono text-xs uppercase">{sub.language}</TableCell>
                    <TableCell>
                      <StatusBadge status={sub.status} verdict={sub.verdict} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      <span className={cn(rejected && "line-through")}>
                        {sub.score} / {sub.maxScore}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ReviewCell submission={sub} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(sub.createdAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => void inspectSubmission(sub)}
                                aria-label="Inspect submission"
                              />
                            }
                          >
                            <EyeIcon />
                          </TooltipTrigger>
                          <TooltipContent>Inspect code &amp; logs</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRejudge(sub)}
                                disabled={busy}
                                aria-label="Re-judge submission"
                              />
                            }
                          >
                            {busy ? <Spinner /> : <RotateCcwIcon />}
                          </TooltipTrigger>
                          <TooltipContent>Re-judge</TooltipContent>
                        </Tooltip>

                        {rejected ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleRestore(sub)}
                                  disabled={busy}
                                  aria-label="Restore submission"
                                />
                              }
                            >
                              <Undo2Icon />
                            </TooltipTrigger>
                            <TooltipContent>Count this submission again</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => {
                                    setReviewReason("");
                                    setReviewTarget(sub);
                                  }}
                                  disabled={busy}
                                  aria-label="Reject submission"
                                />
                              }
                            >
                              <BanIcon />
                            </TooltipTrigger>
                            <TooltipContent>Stop counting on the leaderboard</TooltipContent>
                          </Tooltip>
                        )}

                        {sub.teamId && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setUnstickTarget(sub)}
                                  disabled={busy}
                                  aria-label="Clear team submission lock"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                />
                              }
                            >
                              <ShieldAlertIcon />
                            </TooltipTrigger>
                            <TooltipContent>Clear team submission lock</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <DataPagination state={pagination} itemLabel="submission" />
        </div>
      )}

      {/* A reason is required: this is the decision that gets challenged. */}
      <Dialog
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => !open && !reviewing && setReviewTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject this submission</DialogTitle>
            <DialogDescription>
              {reviewTarget?.teamName || reviewTarget?.userName} ·{" "}
              {reviewTarget?.problemTitle || reviewTarget?.problemId} · {reviewTarget?.score} /{" "}
              {reviewTarget?.maxScore}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              The submission keeps its verdict and stays visible to the competitor. It stops
              counting towards the team&apos;s best score for this problem, and the leaderboard
              falls back to their next best accepted submission.
            </p>
            <Field>
              <FieldLabel htmlFor="reject-reason">Reason</FieldLabel>
              <Textarea
                id="reject-reason"
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                placeholder="Why is this being rejected?"
                rows={3}
                autoFocus
                className="text-xs"
              />
              <FieldDescription>Recorded against your account.</FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!reviewReason.trim() || reviewing}
              onClick={handleReject}
              className="gap-1.5"
            >
              {reviewing ? <Spinner /> : <BanIcon />} Reject submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(unstickTarget)}
        onOpenChange={(open) => !open && setUnstickTarget(null)}
        title="Clear submission lock"
        description={
          <>
            Clear the active submission lock for{" "}
            <strong className="text-foreground">
              {unstickTarget?.teamName || unstickTarget?.userName}
            </strong>
            ? Any in-flight submission for that team is released so they can submit again.
          </>
        }
        actionLabel="Clear lock"
        variant="destructive"
        onConfirm={confirmUnstick}
      />

      <Dialog
        open={Boolean(selectedSubmission)}
        onOpenChange={(open) => !open && setSelectedSubmission(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>Submission {selectedSubmission?.submissionId.slice(0, 8)}</span>
              {selectedSubmission && (
                <StatusBadge
                  status={selectedSubmission.status}
                  verdict={selectedSubmission.verdict}
                />
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedSubmission?.teamName || "No team"} · {selectedSubmission?.userName} ·{" "}
              {selectedSubmission?.language}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 text-xs">
            {selectedSubmission?.reviewStatus === "rejected" && (
              <div className="rounded-lg border border-dashed bg-muted/50 p-3">
                <span className="flex items-center gap-1.5 font-semibold">
                  <BanIcon className="size-3.5" /> Rejected — not counted on the leaderboard
                </span>
                <p className="mt-1 text-muted-foreground">
                  {selectedSubmission.reviewReason || "No reason recorded."}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {selectedSubmission.reviewedBy && `by ${selectedSubmission.reviewedBy}`}
                  {selectedSubmission.reviewedAt &&
                    ` · ${new Date(selectedSubmission.reviewedAt).toLocaleString()}`}
                </p>
              </div>
            )}

            {selectedSubmission?.compileError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 font-mono text-destructive">
                <span className="mb-1 block font-semibold">Compilation error</span>
                <pre className="overflow-x-auto whitespace-pre-wrap">
                  {selectedSubmission.compileError}
                </pre>
              </div>
            )}

            <div>
              <span className="mb-1 block font-semibold text-muted-foreground">Source code</span>
              <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs">
                {selectedSubmission?.code}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function MetricCard({
  label,
  value,
  icon,
  hint,
  valueClassName,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
  valueClassName?: string;
  loading?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div className={cn("font-mono text-2xl font-bold", valueClassName)}>{value}</div>
        )}
        {hint && !loading && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Neutral on purpose. Status/verdict already owns the success/destructive palette
 * in this table, so review carries its meaning through the icon, the dimmed row
 * and the struck-through score rather than competing for the same colours.
 */
function ReviewCell({ submission }: { submission: AdminSubmission }) {
  if (submission.reviewStatus !== "rejected") {
    return <span className="text-[11px] text-muted-foreground">Counted</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="outline" className="w-fit gap-1 border-dashed text-[10px]">
        <BanIcon className="size-3" /> Rejected
      </Badge>
      {submission.reviewReason && (
        <Tooltip>
          <TooltipTrigger
            render={<span className="max-w-45 truncate text-[10px] text-muted-foreground" />}
          >
            {submission.reviewReason}
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{submission.reviewReason}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function StatusBadge({ status, verdict }: { status: string; verdict?: string }) {
  if (status === "queued") {
    return (
      <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
        <ClockIcon className="size-3" /> Queued
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">
        <Spinner className="size-3" /> Evaluating
      </Badge>
    );
  }
  if (status === "passed") {
    return <Badge className="bg-success/15 text-[10px] text-success">{verdict || "AC"}</Badge>;
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      <AlertTriangleIcon className="size-3" /> {verdict || "Failed"}
    </Badge>
  );
}
