"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionUserAction } from "@/lib/actions/auth";
import { listUsersAction } from "@/lib/actions/users";
import { listTeamsAction } from "@/lib/actions/teams";
import { AdminNavbar } from "@/components/navbar";
import { AdminUsers } from "@/components/admin-users";
import type { User } from "@/types/user";
import type { Team } from "@/types/team";

export default function UsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const user = await getSessionUserAction();
      if (!user || user.role !== "admin") {
        router.push("/login");
        return;
      }
      setCurrentUser(user);

      const [usersData, teamsData] = await Promise.all([
        listUsersAction(),
        listTeamsAction(),
      ]);
      setUsers(usersData);
      setTeams(teamsData);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to load user list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground font-medium">
        Loading Users...
      </div>
    );
  }

  if (error || !currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-xs text-destructive mb-4 font-medium">{error || "Authentication required."}</p>
        <button
          onClick={() => router.push("/login")}
          className="px-4 py-2 text-xs rounded bg-primary text-primary-foreground font-medium"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AdminNavbar user={currentUser} onRefresh={loadData} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <AdminUsers users={users} teams={teams} currentUserId={currentUser.id} onRefresh={loadData} />
      </main>
    </div>
  );
}
