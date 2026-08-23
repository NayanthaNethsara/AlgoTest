"use client";

import { useCallback, useEffect, useState } from "react";
import { listUsersAction } from "@/lib/actions/users";
import { listTeamsAction } from "@/lib/actions/teams";
import { AdminUsers } from "@/components/admin-users";
import type { User } from "@/types/user";
import type { Team } from "@/types/team";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, teamsData] = await Promise.all([listUsersAction(), listTeamsAction()]);
      setUsers(usersData);
      setTeams(teamsData);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to load user list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-xs text-muted-foreground font-medium">
        Loading Users...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center p-4">
        <p className="text-xs text-destructive mb-4 font-medium">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 text-xs rounded bg-primary text-primary-foreground font-medium cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <AdminUsers users={users} teams={teams} onRefresh={loadData} />
    </main>
  );
}
