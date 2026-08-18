"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionUserAction } from "@/lib/actions/auth";
import { listProblemsAction } from "@/lib/actions/problems";
import { AdminNavbar } from "@/components/navbar";
import { AdminProblems } from "@/components/admin-problems";
import type { User } from "@/types/user";
import type { ProblemDetail } from "@/types/problem";

export default function ProblemsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [problems, setProblems] = useState<ProblemDetail[]>([]);
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

      const problemsData = await listProblemsAction();
      setProblems(problemsData);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to load problem list.");
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
        Loading Problems...
      </div>
    );
  }

  if (error || !currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-xs text-destructive mb-4 font-medium">
          {error || "Authentication required."}
        </p>
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
        <AdminProblems problems={problems} onRefresh={loadData} />
      </main>
    </div>
  );
}
