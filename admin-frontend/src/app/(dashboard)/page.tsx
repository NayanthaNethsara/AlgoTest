"use client";

import { useCallback } from "react";
import { listProblemsAction } from "@/lib/actions/problems";
import { listUsersAction } from "@/lib/actions/users";
import { listTeamsAction } from "@/lib/actions/teams";
import { listAdminSubmissionsAction } from "@/lib/actions/submissions";
import { getAdminContestStateAction } from "@/lib/actions/contest";
import { getMonitoringSnapshotAction } from "@/lib/actions/monitoring";
import { AdminDashboard, type DashboardData } from "@/components/dashboard/admin-dashboard";
import { ErrorState } from "@/components/shell/data-states";
import { PageShell } from "@/components/shell/page-shell";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { useAsyncData } from "@/hooks/use-async-data";

const EMPTY: DashboardData = {
  problems: [],
  users: [],
  teams: [],
  submissions: [],
  contest: null,
  proctor: null,
};

export default function OverviewPage() {
  // Each panel degrades on its own: a monitoring outage must not blank the
  // roster counts an organizer is standing in front of.
  const loader = useCallback(async (): Promise<DashboardData> => {
    const [problems, users, teams, submissions, contest, monitoring] = await Promise.all([
      listProblemsAction().catch(() => EMPTY.problems),
      listUsersAction().catch(() => EMPTY.users),
      listTeamsAction().catch(() => EMPTY.teams),
      listAdminSubmissionsAction("")
        .then((res) => res.submissions || EMPTY.submissions)
        .catch(() => EMPTY.submissions),
      getAdminContestStateAction().catch(() => null),
      getMonitoringSnapshotAction(["overview"]).catch(() => ({ snapshot: undefined })),
    ]);

    return {
      problems,
      users,
      teams,
      submissions,
      contest,
      proctor: monitoring.snapshot?.overview ?? null,
    };
  }, []);

  const { data, error, loading, refreshing, refresh } = useAsyncData(
    loader,
    EMPTY,
    "Failed to load the contest overview."
  );

  return (
    <PageShell width="wide">
      {loading ? (
        <DashboardSkeleton />
      ) : error && data.problems.length === 0 && data.users.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <AdminDashboard data={data} refreshing={refreshing} loadError={error} onRefresh={refresh} />
      )}
    </PageShell>
  );
}
