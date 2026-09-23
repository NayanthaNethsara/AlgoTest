"use client";

import Link from "next/link";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  FileCode2Icon,
  HistoryIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TimerIcon,
  TrophyIcon,
  UploadIcon,
  Users2Icon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  ReadinessChecklist,
  type ReadinessCheck,
} from "@/components/dashboard/readiness-checklist";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shell/data-states";
import { MIN_EVALUATION_TEST_CASES } from "@/lib/testcase-utils";
import { cn } from "@/lib/utils";
import { CONTEST_STATUS, type ContestState } from "@/types/contest";
import type { ProblemDetail } from "@/types/problem";
import type { ProctorOverview } from "@/types/proctor";
import type { AdminSubmission } from "@/types/submission";
import type { Team } from "@/types/team";
import type { User } from "@/types/user";

export type DashboardData = {
  problems: ProblemDetail[];
  users: User[];
  teams: Team[];
  submissions: AdminSubmission[];
  contest: ContestState | null;
  proctor: ProctorOverview | null;
};

const STATUS_LABEL: Record<string, string> = {
  [CONTEST_STATUS.NOT_STARTED]: "Not started",
  [CONTEST_STATUS.RUNNING]: "Running",
  [CONTEST_STATUS.PAUSED]: "Paused",
  [CONTEST_STATUS.ENDED]: "Ended",
};

const QUICK_ACTIONS = [
  { href: "/problems/new", label: "New problem", icon: PlusIcon },
  { href: "/users", label: "Import roster", icon: UploadIcon },
  { href: "/teams", label: "Manage teams", icon: Users2Icon },
  { href: "/submissions", label: "Judge queue", icon: HistoryIcon },
  { href: "/monitoring/risk", label: "Risk review", icon: ShieldAlertIcon },
  { href: "/timer", label: "Projector timer", icon: TimerIcon },
];

function testCountOf(problem: ProblemDetail) {
  return problem.testCount ?? problem.tests?.length ?? 0;
}

export function AdminDashboard({
  data,
  refreshing,
  loadError,
  onRefresh,
}: {
  data: DashboardData;
  refreshing: boolean;
  loadError: string | null;
  onRefresh: () => void;
}) {
  const { problems, users, teams, submissions, contest, proctor } = data;

  const competitors = users.filter((u) => u.role === "competitor");
  const suspended = competitors.filter((u) => u.isSuspended).length;
  const unassigned = competitors.filter((u) => !u.teamId).length;
  const published = problems.filter((p) => p.published);
  const underTested = problems.filter((p) => testCountOf(p) < MIN_EVALUATION_TEST_CASES);
  const emptyTeams = teams.filter((t) => (t.members?.length ?? 0) === 0).length;

  const queued = submissions.filter((s) => s.status === "queued").length;
  const running = submissions.filter((s) => s.status === "running").length;
  const failed = submissions.filter((s) => s.status === "failed").length;
  const rejected = submissions.filter((s) => s.reviewStatus === "rejected").length;

  const fleet = proctor?.fleet;
  const highRisk = fleet?.highRisk ?? 0;
  const notReporting = fleet ? fleet.stale + fleet.offline : 0;

  const recentSubmissions = [...submissions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const checks: ReadinessCheck[] = [
    {
      id: "problems",
      label: "Published problems",
      detail:
        published.length > 0
          ? `${published.length} of ${problems.length} problem(s) are visible to competitors.`
          : "No problem is published yet — competitors would see an empty contest.",
      status: published.length > 0 ? "ok" : "blocked",
      href: "/problems",
      action: "Publish",
    },
    {
      id: "tests",
      label: "Evaluation coverage",
      detail:
        underTested.length === 0
          ? `Every problem has at least ${MIN_EVALUATION_TEST_CASES} evaluation tests.`
          : `${underTested.length} problem(s) have fewer than ${MIN_EVALUATION_TEST_CASES} tests and cannot be published.`,
      status: underTested.length === 0 ? "ok" : "warn",
      href: "/problems",
      action: "Add tests",
    },
    {
      id: "roster",
      label: "Competitor roster",
      detail:
        competitors.length === 0
          ? "No competitor accounts exist yet."
          : `${competitors.length} competitor(s) across ${teams.length} team(s).`,
      status: competitors.length === 0 ? "blocked" : "ok",
      href: "/users",
      action: "Add",
    },
    {
      id: "teams",
      label: "Team assignment",
      detail:
        unassigned === 0 && emptyTeams === 0
          ? "Every competitor belongs to a team, and no team is empty."
          : `${unassigned} competitor(s) unassigned · ${emptyTeams} empty team(s).`,
      status: unassigned === 0 && emptyTeams === 0 ? "ok" : "warn",
      href: "/teams",
      action: "Assign",
    },
    {
      id: "proctoring",
      label: "Proctor fleet",
      detail: fleet
        ? `${fleet.enrolled} of ${fleet.competitors} enrolled · ${fleet.online} online · ${notReporting} not reporting.`
        : "Fleet telemetry is unavailable right now.",
      status: !fleet ? "warn" : notReporting > 0 ? "warn" : "ok",
      href: "/monitoring/telemetry",
      action: "Inspect",
    },
  ];

  const contestStatus = contest?.status ?? CONTEST_STATUS.NOT_STARTED;
  const isLive = contestStatus === CONTEST_STATUS.RUNNING;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Contest overview"
        description={
          contest
            ? `${contest.title} · ${STATUS_LABEL[contestStatus]}${contest.isFrozen ? " · leaderboard frozen" : ""}`
            : "Live picture of the contest, the roster, and the judge."
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              {refreshing ? <Spinner /> : <RefreshCwIcon />} Refresh
            </Button>
            <Link
              href="/problems/new"
              className={buttonVariants({ size: "sm", className: "gap-1.5" })}
            >
              <PlusIcon /> New problem
            </Link>
          </>
        }
      />

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Some panels may be out of date</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {proctor?.incident && !proctor.incident.endedAt && (
        <Alert variant="destructive">
          <ActivityIcon />
          <AlertTitle>Fleet telemetry incident in progress</AlertTitle>
          <AlertDescription>
            {proctor.incident.affectedAgents} of {proctor.incident.enrolledAgents} agents went quiet
            at once. Treat contestant blackouts from this window as ours, not theirs.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Problems"
          value={problems.length}
          hint={`${published.length} published · ${underTested.length} under-tested`}
          icon={<FileCode2Icon />}
          tone={underTested.length > 0 ? "warning" : "neutral"}
          href="/problems"
        />
        <StatCard
          label="Competitors"
          value={competitors.length}
          hint={`${teams.length} team(s) · ${unassigned} unassigned${suspended > 0 ? ` · ${suspended} suspended` : ""}`}
          icon={<UsersIcon />}
          tone={unassigned > 0 ? "warning" : "neutral"}
          href="/users"
        />
        <StatCard
          label="Judge queue"
          value={queued + running}
          hint={`${queued} queued · ${running} running · ${failed} failed`}
          icon={<HistoryIcon />}
          tone={queued > 20 ? "warning" : "neutral"}
          href="/submissions"
        />
        <StatCard
          label="High risk"
          value={highRisk}
          hint={
            fleet
              ? `${fleet.online} online · ${notReporting} not reporting`
              : "Telemetry unavailable"
          }
          icon={<ShieldAlertIcon />}
          tone={highRisk > 0 ? "destructive" : notReporting > 0 ? "warning" : "neutral"}
          href="/monitoring/risk"
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "gap-1.5",
                  })}
                >
                  <Icon /> {action.label}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReadinessChecklist checks={checks} />

        <Card className="h-full">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">Recent submissions</CardTitle>
            <p className="text-xs text-muted-foreground">
              {submissions.length} total{rejected > 0 && ` · ${rejected} rejected by an organizer`}
            </p>
            <Link
              href="/submissions"
              className={buttonVariants({
                variant: "ghost",
                size: "xs",
                className: "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
              })}
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="px-0">
            {recentSubmissions.length === 0 ? (
              <EmptyState
                icon={isLive ? <ClockIcon /> : <TrophyIcon />}
                title="No submissions yet"
                description={
                  isLive
                    ? "Competitors have not submitted anything since the contest started."
                    : "Submissions appear here once the contest is running."
                }
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Team</TableHead>
                    <TableHead>Problem</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead className="pr-4 text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSubmissions.map((sub) => (
                    <TableRow key={sub.submissionId}>
                      <TableCell className="max-w-40 truncate pl-4 text-xs font-medium">
                        {sub.teamName || sub.userName}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs">
                        {sub.problemTitle || sub.problemId}
                      </TableCell>
                      <TableCell>
                        <VerdictBadge submission={sub} />
                      </TableCell>
                      <TableCell className="pr-4 text-right font-mono text-xs">
                        <span className={cn(sub.reviewStatus === "rejected" && "line-through")}>
                          {sub.score}/{sub.maxScore}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VerdictBadge({ submission }: { submission: AdminSubmission }) {
  if (submission.status === "queued") {
    return (
      <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
        <ClockIcon className="size-3" /> Queued
      </Badge>
    );
  }
  if (submission.status === "running") {
    return (
      <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">
        <Spinner className="size-3" /> Running
      </Badge>
    );
  }
  if (submission.status === "passed") {
    return (
      <Badge className="bg-success/15 text-[10px] text-success">
        <CheckCircle2Icon className="size-3" /> {submission.verdict || "AC"}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      <XCircleIcon className="size-3" /> {submission.verdict || "Failed"}
    </Badge>
  );
}
