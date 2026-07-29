"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getJson } from "@/lib/api";
import { AdminDashboard } from "@/components/admin-dashboard";
import type { User } from "@/types/user";
import type { ProblemDetail } from "@/types/problem";

export default function HomePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [problems, setProblems] = useState<ProblemDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const meRes = await apiFetch("/api/v1/me");
      if (!meRes.ok) {
        router.push("/login");
        return;
      }
      const user: User = await meRes.json();
      if (user.role !== "admin") {
        setError("Access Denied: Admin role required.");
        router.push("/login");
        return;
      }
      setCurrentUser(user);

      const [usersData, problemsData] = await Promise.all([
        getJson<{ users: User[] }>("/api/v1/admin/users"),
        getJson<{ problems: ProblemDetail[] }>("/api/v1/admin/problems"),
      ]);

      setUsers(usersData.users || []);
      setProblems(problemsData.problems || []);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleLogout() {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem("admin_token");
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading Admin Console...
      </div>
    );
  }

  if (error || !currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-sm text-red-500 mb-4">{error || "Authentication required."}</p>
        <button
          onClick={() => router.push("/login")}
          className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <AdminDashboard
      user={currentUser}
      users={users}
      problems={problems}
      onRefresh={loadData}
      onLogout={handleLogout}
    />
  );
}
