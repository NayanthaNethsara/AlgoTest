"use client";

import { useState } from "react";
import { Users, FileCode2 } from "lucide-react";
import { AdminUsers } from "./admin-users";
import { AdminProblems } from "./admin-problems";
import type { AdminUser } from "@/actions/admin";
import type { ProblemDetail } from "@/actions/problems";

type AdminDashboardProps = {
  users: AdminUser[];
  currentUserId: string;
  problems: ProblemDetail[];
};

export function AdminDashboard({ users, currentUserId, problems }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"users" | "problems">("problems");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Console</h1>
          <p className="text-sm text-muted-foreground">Manage platform users, problems, and test suites.</p>
        </div>

        <div className="flex bg-muted p-1 rounded-lg border text-sm">
          <button
            type="button"
            onClick={() => setActiveTab("problems")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === "problems"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileCode2 className="h-4 w-4" /> Problems ({problems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === "users"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" /> Users ({users.length})
          </button>
        </div>
      </div>

      {activeTab === "users" ? (
        <AdminUsers users={users} currentUserId={currentUserId} />
      ) : (
        <AdminProblems problems={problems} />
      )}
    </div>
  );
}
