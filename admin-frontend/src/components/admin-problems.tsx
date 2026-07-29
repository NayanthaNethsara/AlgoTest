"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Edit2, Trash2, Eye, EyeOff, Layers } from "lucide-react";
import { togglePublishAction, deleteProblemAction } from "@/lib/actions/problems";
import type { ProblemDetail } from "@/types/problem";
import { TestCaseManager } from "./testcase-manager";
import { ConfirmDialog } from "./confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

export function AdminProblems({
  problems,
  onRefresh,
}: {
  problems: ProblemDetail[];
  onRefresh: () => void;
}) {
  const [testManagerProblem, setTestManagerProblem] = useState<{ id: string; title: string } | null>(null);
  const [deletingProblem, setDeletingProblem] = useState<ProblemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleTogglePublish(id: string, currentPublished: boolean) {
    setError(null);
    setPending(true);
    try {
      await togglePublishAction(id, !currentPublished);
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setPending(false);
    }
  }

  async function confirmDeleteProblem() {
    if (!deletingProblem) return;
    const id = deletingProblem.id;
    setDeletingProblem(null);
    setError(null);
    setPending(true);
    try {
      await deleteProblemAction(id);
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
        <Link href="/problems/new" className={buttonVariants({ size: "sm", className: "gap-1.5" })}>
          <Plus className="h-4 w-4" /> Create Problem
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title & Slug</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Limits</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {problems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-xs text-muted-foreground">
                  No problems found. Click &quot;Create Problem&quot; or import problems using problemtool CLI.
                </TableCell>
              </TableRow>
            ) : (
              problems.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-xs">{p.title}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">{p.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${
                        p.difficulty === "Easy"
                          ? "border-green-500/30 text-green-600 bg-green-500/10"
                          : p.difficulty === "Medium"
                          ? "border-yellow-500/30 text-yellow-600 bg-yellow-500/10"
                          : "border-red-500/30 text-red-600 bg-red-500/10"
                      }`}
                    >
                      {p.difficulty}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {p.timeLimitMs}ms / {p.memoryLimitMb}MB
                  </TableCell>
                  <TableCell className="font-medium text-xs">{p.maxScore}</TableCell>
                  <TableCell>
                    <Badge variant={p.published ? "default" : "secondary"} className="text-[11px]">
                      {p.published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTogglePublish(p.id, Boolean(p.published))}
                        disabled={pending}
                        title={p.published ? "Unpublish" : "Publish"}
                        className="h-8 w-8"
                      >
                        {p.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-primary" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTestManagerProblem({ id: p.id, title: p.title })}
                        title="Manage Test Cases"
                        className="h-8 w-8"
                      >
                        <Layers className="h-4 w-4" />
                      </Button>
                      <Link
                        href={`/problems/${p.id}/edit`}
                        title="Edit Problem"
                        className={buttonVariants({ variant: "ghost", size: "icon", className: "h-8 w-8 text-foreground" })}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingProblem(p)}
                        disabled={pending}
                        title="Delete Problem"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={Boolean(deletingProblem)}
        onOpenChange={(open) => !open && setDeletingProblem(null)}
        title="Delete Problem"
        description={
          <>
            Are you sure you want to permanently delete <strong className="text-foreground">{deletingProblem?.title}</strong> ({deletingProblem?.slug})? This will erase the statement, samples, and all test case files.
          </>
        }
        actionLabel="Delete Problem"
        variant="destructive"
        onConfirm={confirmDeleteProblem}
      />

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
