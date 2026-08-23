"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Undo2,
  XCircle,
} from "lucide-react";
import {
  listAdminSubmissionsAction,
  rejudgeSubmissionAction,
  reviewSubmissionAction,
  unstickTeamAction,
} from "@/actions/submissions";
import type { AdminSubmission } from "@/types/submission";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedSubmission, setSelectedSubmission] = useState<AdminSubmission | null>(null);
  const [reviewTarget, setReviewTarget] = useState<AdminSubmission | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    const filter = statusFilter === "all" ? "" : statusFilter;
    const res = await listAdminSubmissionsAction(filter);
    setSubmissions(res.submissions || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  async function handleRejudge(id: string) {
    setActionMessage(null);
    const res = await rejudgeSubmissionAction(id);
    if (res.success) {
      setActionMessage({ text: "Submission re-queued for judging.", type: "success" });
      fetchSubmissions();
    } else {
      setActionMessage({ text: res.error || "Failed to re-judge", type: "error" });
    }
  }

  async function handleReject() {
    if (!reviewTarget || !reviewReason.trim()) return;
    setReviewing(true);
    const res = await reviewSubmissionAction(
      reviewTarget.submissionId,
      "rejected",
      reviewReason.trim()
    );
    setReviewing(false);
    if (res.success) {
      setReviewTarget(null);
      setReviewReason("");
      setActionMessage({
        text: "Submission rejected. The team's best score for this problem was recomputed.",
        type: "success",
      });
      fetchSubmissions();
    } else {
      setActionMessage({ text: res.error || "Failed to reject", type: "error" });
    }
  }

  async function handleRestore(sub: AdminSubmission) {
    setActionMessage(null);
    const res = await reviewSubmissionAction(sub.submissionId, "accepted", "");
    if (res.success) {
      setActionMessage({
        text: "Submission restored. It counts towards the leaderboard again.",
        type: "success",
      });
      fetchSubmissions();
    } else {
      setActionMessage({ text: res.error || "Failed to restore", type: "error" });
    }
  }

  async function handleUnstick(teamId: string, teamName: string) {
    if (
      !confirm(`Are you sure you want to clear active submission locks for team "${teamName}"?`)
    ) {
      return;
    }
    setActionMessage(null);
    const res = await unstickTeamAction(teamId);
    if (res.success) {
      setActionMessage({ text: `Submission locks cleared for ${teamName}.`, type: "success" });
      fetchSubmissions();
    } else {
      setActionMessage({ text: res.error || "Failed to unstick team", type: "error" });
    }
  }

  const queuedCount = submissions.filter((s) => s.status === "queued").length;
  const runningCount = submissions.filter((s) => s.status === "running").length;
  const passedCount = submissions.filter((s) => s.status === "passed").length;
  const failedCount = submissions.filter((s) => s.status === "failed").length;
  const rejectedCount = submissions.filter((s) => s.reviewStatus === "rejected").length;

  return (
    <main className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Submissions & Judge Monitor</h2>
          <p className="text-xs text-muted-foreground">
            Inspect database execution logs, re-judge stuck tasks, and manage submission locks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 w-40 rounded-md border bg-background px-3 text-xs shadow-sm"
          >
            <option value="all">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>

          <Button
            size="sm"
            variant="outline"
            onClick={fetchSubmissions}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-xs ${
            actionMessage.type === "success"
              ? "bg-success/15 text-success border border-success/30"
              : "bg-destructive/15 text-destructive border border-destructive/30"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Queued Jobs</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent className="py-2 px-4">
            <div className="text-2xl font-bold font-mono">{queuedCount}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Running Jobs
            </CardTitle>
            <Play className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="py-2 px-4">
            <div className="text-2xl font-bold font-mono">{runningCount}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Passed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent className="py-2 px-4">
            <div className="text-2xl font-bold font-mono text-success">{passedCount}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Failed / Errors
            </CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="py-2 px-4">
            <div className="text-2xl font-bold font-mono text-destructive">{failedCount}</div>
            <p className="text-[11px] text-muted-foreground">
              {rejectedCount} rejected by an organizer
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Submissions Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading submissions...
            </div>
          ) : submissions.length === 0 ? (
            <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
              No submissions found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">ID</TableHead>
                  <TableHead>Competitor / Team</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Lang</TableHead>
                  <TableHead>Status / Verdict</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((sub) => {
                  const rejected = sub.reviewStatus === "rejected";
                  return (
                    <TableRow
                      key={sub.submissionId}
                      className={rejected ? "opacity-60" : undefined}
                    >
                      <TableCell className="font-mono text-xs font-semibold">
                        {sub.submissionId.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span className="font-medium text-foreground">
                            {sub.teamName || sub.userName}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{sub.userName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {sub.problemTitle || sub.problemId}
                      </TableCell>
                      <TableCell className="font-mono text-xs uppercase">{sub.language}</TableCell>
                      <TableCell>
                        <StatusBadge status={sub.status} verdict={sub.verdict} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span className={rejected ? "line-through" : undefined}>
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
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedSubmission(sub)}
                            className="h-7 w-7 p-0"
                            title="Inspect Code"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejudge(sub.submissionId)}
                            className="h-7 px-2 text-[11px] gap-1"
                            title="Re-judge Submission"
                          >
                            <RotateCcw className="h-3 w-3" /> Rejudge
                          </Button>

                          {rejected ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestore(sub)}
                              className="h-7 px-2 text-[11px] gap-1"
                              title="Count this submission again"
                            >
                              <Undo2 className="h-3 w-3" /> Restore
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setReviewReason("");
                                setReviewTarget(sub);
                              }}
                              className="h-7 px-2 text-[11px] gap-1"
                              title="Stop this submission counting towards the leaderboard"
                            >
                              <Ban className="h-3 w-3" /> Reject
                            </Button>
                          )}

                          {sub.teamId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleUnstick(sub.teamId, sub.teamName || sub.userName)
                              }
                              className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 gap-1"
                              title="Clear Team Submission Lock"
                            >
                              <ShieldAlert className="h-3 w-3" /> Unstick
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rejection Dialog: a reason is required, because this is the decision that gets challenged. */}
      {reviewTarget && (
        <Dialog open onOpenChange={() => setReviewTarget(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">Reject this submission</DialogTitle>
              <DialogDescription className="text-xs">
                {reviewTarget.teamName || reviewTarget.userName} ·{" "}
                {reviewTarget.problemTitle || reviewTarget.problemId} · {reviewTarget.score} /{" "}
                {reviewTarget.maxScore}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                The submission keeps its verdict and stays visible to the competitor. It stops
                counting towards the team&apos;s best score for this problem, and the leaderboard
                falls back to their next best accepted submission.
              </p>
              <Textarea
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                placeholder="Why is this being rejected? Recorded against your account."
                rows={3}
                className="text-xs"
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setReviewTarget(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!reviewReason.trim() || reviewing}
                onClick={handleReject}
                className="gap-1.5"
              >
                {reviewing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ban className="h-3.5 w-3.5" />
                )}
                Reject submission
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Code & Execution Inspection Dialog */}
      {selectedSubmission && (
        <Dialog open={Boolean(selectedSubmission)} onOpenChange={() => setSelectedSubmission(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between text-base">
                <span>Submission Detail ({selectedSubmission.submissionId.slice(0, 8)})</span>
                <StatusBadge
                  status={selectedSubmission.status}
                  verdict={selectedSubmission.verdict}
                />
              </DialogTitle>
              <DialogDescription className="text-xs">
                Team: {selectedSubmission.teamName || "N/A"} · User: {selectedSubmission.userName} ·
                Language: {selectedSubmission.language}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              {selectedSubmission.reviewStatus === "rejected" && (
                <div className="rounded-md border border-dashed bg-muted/50 p-3">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Ban className="h-3.5 w-3.5" /> Rejected — not counted on the leaderboard
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

              {selectedSubmission.compileError && (
                <div className="rounded-md border bg-destructive/10 p-3 text-destructive font-mono">
                  <span className="font-semibold block mb-1">Compilation Error Log:</span>
                  <pre className="whitespace-pre-wrap">{selectedSubmission.compileError}</pre>
                </div>
              )}

              <div>
                <span className="font-semibold text-muted-foreground block mb-1">Source Code:</span>
                <pre className="rounded-md border bg-muted/50 p-4 font-mono text-xs overflow-x-auto max-h-96">
                  {selectedSubmission.code}
                </pre>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}

/**
 * Neutral on purpose. Status/verdict already owns the success/destructive palette
 * in this table, so review carries its meaning through the icon, the dimmed row and
 * the struck-through score rather than competing for the same colours.
 */
function ReviewCell({ submission }: { submission: AdminSubmission }) {
  if (submission.reviewStatus !== "rejected") {
    return <span className="text-[11px] text-muted-foreground">Counted</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="outline" className="w-fit gap-1 text-[10px] border-dashed">
        <Ban className="h-3 w-3" /> Rejected
      </Badge>
      {submission.reviewReason && (
        <span
          className="max-w-[180px] truncate text-[10px] text-muted-foreground"
          title={submission.reviewReason}
        >
          {submission.reviewReason}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status, verdict }: { status: string; verdict?: string }) {
  if (status === "queued") {
    return (
      <Badge variant="outline" className="text-warning border-warning/40 text-[10px]">
        Queued
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge variant="outline" className="text-primary border-primary/40 text-[10px]">
        Evaluating...
      </Badge>
    );
  }
  if (status === "passed") {
    return <Badge className="bg-success/15 text-success text-[10px]">{verdict || "AC"}</Badge>;
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      {verdict || "Failed"}
    </Badge>
  );
}
