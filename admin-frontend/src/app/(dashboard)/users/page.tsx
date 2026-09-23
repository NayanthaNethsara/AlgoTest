"use client";

import { useCallback } from "react";
import { getSessionUserAction } from "@/lib/actions/auth";
import { listUsersAction } from "@/lib/actions/users";
import { listTeamsAction } from "@/lib/actions/teams";
import { AdminUsers } from "@/components/admin-users";
import { ErrorState, PageSkeleton } from "@/components/shell/data-states";
import { PageShell } from "@/components/shell/page-shell";
import { useAsyncData } from "@/hooks/use-async-data";
import type { User } from "@/types/user";
import type { Team } from "@/types/team";

type UsersPageData = { users: User[]; teams: Team[]; currentUserId?: string };

const EMPTY: UsersPageData = { users: [], teams: [] };

export default function UsersPage() {
  const loader = useCallback(async (): Promise<UsersPageData> => {
    const [users, teams, session] = await Promise.all([
      listUsersAction(),
      listTeamsAction(),
      getSessionUserAction().catch(() => null),
    ]);
    return { users, teams, currentUserId: session?.id };
  }, []);

  const { data, error, loading, refreshing, refresh } = useAsyncData(
    loader,
    EMPTY,
    "Failed to load the user list."
  );

  return (
    <PageShell>
      {loading ? (
        <PageSkeleton columns={6} />
      ) : error && data.users.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <AdminUsers
          users={data.users}
          teams={data.teams}
          currentUserId={data.currentUserId}
          refreshing={refreshing}
          loadError={error}
          onRefresh={refresh}
        />
      )}
    </PageShell>
  );
}
