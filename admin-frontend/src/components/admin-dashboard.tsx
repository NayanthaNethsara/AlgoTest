"use client";

import { useState } from "react";
import { Users, FileCode2, LogOut, RefreshCw } from "lucide-react";
import { AdminUsers } from "./admin-users";
import { AdminProblems } from "./admin-problems";
import type { User } from "@/types/user";
import type { ProblemDetail } from "@/types/problem";

type AdminDashboardProps = {
  user: User;
  users: User[];
  problems: ProblemDetail[];
  onRefresh: () => void;
  onLogout: () => void;
};

export function AdminDashboard({ user, users, problems, onRefresh, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"users" | "problems">("problems");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MiniAlgothon Admin Console</h1>
          <p className="text-sm text-muted-foreground">Logged in as {user.displayName || user.username} ({user.role})</p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={onRefresh}
            title="Refresh Data"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border bg-background hover:bg-muted font-medium"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>

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

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10 font-medium"
          >
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </div>

      {activeTab === "users" ? (
        <AdminUsers users={users} currentUserId={user.id} onRefresh={onRefresh} />
      ) : (
        <AdminProblems problems={problems} onRefresh={onRefresh} />
      )}
    </div>
  );
}
