"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Edit2, Trash2, Eye, EyeOff, Layers } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { ProblemDetail } from "@/types/problem";
import { TestCaseManager } from "./testcase-manager";

export function AdminProblems({
  problems,
  onRefresh,
}: {
  problems: ProblemDetail[];
  onRefresh: () => void;
}) {
  const [testManagerProblem, setTestManagerProblem] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleTogglePublish(id: string, currentPublished: boolean) {
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`/api/v1/admin/problems/${id}/publish`, {
        method: "PATCH",
        body: JSON.stringify({ published: !currentPublished }),
      });
      if (!res.ok) throw new Error("Failed to change published status");
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this problem?")) return;
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`/api/v1/admin/problems/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete problem");
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Problems</h2>
          <p className="text-xs text-muted-foreground">{problems.length} problem(s) total</p>
        </div>
        <Link
          href="/problems/new"
          className="flex items-center px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Create Problem
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Title & Slug</th>
              <th className="px-4 py-3 font-medium">Difficulty</th>
              <th className="px-4 py-3 font-medium">Limits</th>
              <th className="px-4 py-3 font-medium">Points</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {problems.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No problems found. Click &quot;Create Problem&quot; or import problems using problemtool CLI.
                </td>
              </tr>
            ) : (
              problems.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-xs font-mono text-muted-foreground">{p.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.difficulty === "Easy"
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : p.difficulty === "Medium"
                          ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                          : "bg-red-500/10 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {p.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                    {p.timeLimitMs}ms / {p.memoryLimitMb}MB
                  </td>
                  <td className="px-4 py-3 font-medium">{p.maxScore}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.published
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleTogglePublish(p.id, Boolean(p.published))}
                        disabled={pending}
                        title={p.published ? "Unpublish" : "Publish"}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      >
                        {p.published ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-primary" />}
                      </button>
                      <button
                        onClick={() => setTestManagerProblem({ id: p.id, title: p.title })}
                        title="Manage Test Cases"
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      >
                        <Layers className="h-4 w-4" />
                      </button>
                      <Link
                        href={`/problems/${p.id}/edit`}
                        title="Edit Problem"
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground inline-flex items-center"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={pending}
                        title="Delete Problem"
                        className="p-1.5 rounded hover:bg-muted text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {testManagerProblem && (
        <TestCaseManager
          problemId={testManagerProblem.id}
          problemTitle={testManagerProblem.title}
          onClose={() => setTestManagerProblem(null)}
        />
      )}
    </div>
  );
}
