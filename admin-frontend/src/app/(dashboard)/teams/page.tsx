"use client";

import { useCallback, useMemo } from "react";
import { listUsersAction } from "@/lib/actions/users";
import { listTeamsAction } from "@/lib/actions/teams";
import { AdminTeams } from "@/components/admin-teams";
import { ErrorState, PageSkeleton } from "@/components/shell/data-states";
import { PageShell } from "@/components/shell/page-shell";
import { useAsyncData } from "@/hooks/use-async-data";
import type { User } from "@/types/user";
import type { Team } from "@/types/team";

type TeamsPageData = { teams: Team[]; users: User[] };

const EMPTY: TeamsPageData = { teams: [], users: [] };

export default function TeamsPage() {
  const loader = useCallback(async (): Promise<TeamsPageData> => {
    const [teams, users] = await Promise.all([listTeamsAction(), listUsersAction()]);
    return { teams, users };
  }, []);

  const { data, error, loading, refreshing, refresh } = useAsyncData(
    loader,
    EMPTY,
    "Failed to load teams."
  );

  const competitors = useMemo(
    () => data.users.filter((u) => u.role === "competitor"),
    [data.users]
  );

  return (
    <PageShell>
      {loading ? (
        <PageSkeleton columns={3} />
      ) : error && data.teams.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <AdminTeams
          teams={data.teams}
          competitors={competitors}
          refreshing={refreshing}
          loadError={error}
          onRefresh={refresh}
        />
      )}
    </PageShell>
  );
}
