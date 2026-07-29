"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Eye, EyeOff, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createProblemAction,
  updateProblemAction,
  deleteProblemAction,
  togglePublishAction,
  getAdminProblemDetail,
  type ProblemDetail,
  type ProblemInput,
} from "@/actions/problems";
import { ProblemEditor } from "./problem-editor";
import { TestCaseManager } from "./testcase-manager";

export function AdminProblems({ problems }: { problems: ProblemDetail[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProblem, setEditingProblem] = useState<ProblemDetail | null>(null);

  const [testManagerProblem, setTestManagerProblem] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCreateNew() {
    setEditingProblem(null);
    setEditorOpen(true);
  }

  async function handleEdit(p: ProblemDetail) {
    setError(null);
    const res = await getAdminProblemDetail(p.id);
    if (res.problem) {
      setEditingProblem(res.problem);
      setEditorOpen(true);
    } else {
      setError(res.error || "Failed to load problem details.");
    }
  }

  function handleTogglePublish(id: string, currentPublished: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await togglePublishAction(id, !currentPublished);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this problem?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteProblemAction(id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  async function handleSaveProblem(input: ProblemInput) {
    if (editingProblem) {
      const res = await updateProblemAction(editingProblem.id, input);
      if (res.error) throw new Error(res.error);
    } else {
      const res = await createProblemAction(input);
      if (res.error) throw new Error(res.error);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Problems</h2>
          <p className="text-xs text-muted-foreground">{problems.length} problem(s) total</p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="h-4 w-4 mr-1.5" /> Create Problem
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTogglePublish(p.id, Boolean(p.published))}
                        disabled={pending}
                        title={p.published ? "Unpublish" : "Publish"}
                        className="h-8 w-8"
                      >
                        {p.published ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-primary" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTestManagerProblem({ id: p.id, title: p.title })}
                        title="Manage Test Cases"
                        className="h-8 w-8"
                      >
                        <Layers className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(p)}
                        title="Edit Problem"
                        className="h-8 w-8"
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(p.id)}
                        disabled={pending}
                        title="Delete Problem"
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editorOpen && (
        <ProblemEditor
          initialData={editingProblem}
          onSave={handleSaveProblem}
          onClose={() => setEditorOpen(false)}
          pending={pending}
        />
      )}

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
