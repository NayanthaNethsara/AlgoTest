"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Edit2, Trash2, Eye, EyeOff, Layers, Search, X, AlertTriangle } from "lucide-react";
import { togglePublishAction, deleteProblemAction } from "@/lib/actions/problems";
import type { ProblemDetail } from "@/types/problem";
import { TestCaseManager } from "./testcase-manager";
import { ConfirmDialog } from "./confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

export function AdminProblems({
  problems,
  onRefresh,
}: {
  problems: ProblemDetail[];
  onRefresh: () => void;
}) {
  const [testManagerProblem, setTestManagerProblem] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deletingProblem, setDeletingProblem] = useState<ProblemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredProblems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return problems.filter((problem) => {
      const matchesSearch =
        !query ||
        problem.title.toLowerCase().includes(query) ||
        problem.slug.toLowerCase().includes(query);
      const matchesDifficulty =
        difficultyFilter === "all" || problem.difficulty === difficultyFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "published" ? problem.published : !problem.published);
      return matchesSearch && matchesDifficulty && matchesStatus;
    });
  }, [problems, searchQuery, difficultyFilter, statusFilter]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 || difficultyFilter !== "all" || statusFilter !== "all";

  function clearFilters() {
    setSearchQuery("");
    setDifficultyFilter("all");
    setStatusFilter("all");
  }

  async function handleTogglePublish(problem: ProblemDetail) {
    const testCount = problem.testCount ?? problem.tests?.length ?? 0;
    if (!problem.published && testCount < 5) {
      setError(
        `Cannot publish "${problem.title}": at least 5 evaluation test cases are required (currently has ${testCount}). Click the Test Cases badge or button to upload additional tests.`
      );
      return;
    }

    setError(null);
    setPending(true);
    try {
      await togglePublishAction(problem.id, !problem.published);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Problems</h2>
          <p className="text-xs text-muted-foreground">
            {problems.length} total problem(s)
            {hasActiveFilters && ` • ${filteredProblems.length} matching filters`}
          </p>
        </div>
        <Link href="/problems/new" className={buttonVariants({ size: "sm", className: "gap-1.5" })}>
          <Plus className="h-4 w-4" /> Create Problem
        </Link>
      </div>

      {error && (
        <div className="flex items-start justify-between rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-destructive/80 hover:text-destructive cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search problems by title or slug..."
            className="pl-8 h-8 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          className="h-8 rounded-md border bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-md border bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear Filters
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title & Slug</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Limits</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Test Cases</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProblems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                  {hasActiveFilters ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <span>No problems match the specified search query or filters.</span>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={clearFilters}
                        className="h-auto p-0 text-xs"
                      >
                        Reset filters
                      </Button>
                    </div>
                  ) : (
                    <span>
                      No problems found. Click &quot;Create Problem&quot; or import problems using
                      the CLI.
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filteredProblems.map((p) => {
                const testCount = p.testCount ?? p.tests?.length ?? 0;
                const hasSufficientTests = testCount >= 5;

                return (
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
                            ? "border-success/30 text-success bg-success/10"
                            : p.difficulty === "Medium"
                              ? "border-warning/30 text-warning bg-warning/10"
                              : "border-destructive/30 text-destructive bg-destructive/10"
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
                      <button
                        type="button"
                        onClick={() => setTestManagerProblem({ id: p.id, title: p.title })}
                        title="Manage test cases"
                        className="flex items-center gap-1 text-left group cursor-pointer"
                      >
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-mono gap-1 transition-colors ${
                            hasSufficientTests
                              ? "group-hover:border-primary/50 group-hover:bg-primary/5"
                              : "border-warning/40 bg-warning/10 text-warning group-hover:border-warning"
                          }`}
                        >
                          <Layers className="h-3 w-3" />
                          {testCount} {testCount === 1 ? "test" : "tests"}
                        </Badge>
                        {!hasSufficientTests && (
                          <span
                            title="Minimum 5 tests required for evaluation before publishing"
                            className="text-warning text-xs inline-flex items-center"
                          >
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.published ? "default" : "secondary"}
                        className="text-[11px]"
                      >
                        {p.published ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTogglePublish(p)}
                          disabled={pending}
                          title={
                            p.published
                              ? "Unpublish"
                              : !hasSufficientTests
                                ? "Requires at least 5 tests to publish"
                                : "Publish"
                          }
                          className="h-8 w-8"
                        >
                          {p.published ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye
                              className={`h-4 w-4 ${hasSufficientTests ? "text-primary" : "text-muted-foreground"}`}
                            />
                          )}
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
                          className={buttonVariants({
                            variant: "ghost",
                            size: "icon",
                            className: "h-8 w-8 text-foreground",
                          })}
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
                );
              })
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
            Are you sure you want to permanently delete{" "}
            <strong className="text-foreground">{deletingProblem?.title}</strong> (
            {deletingProblem?.slug})? This will erase the statement, samples, and all test case
            files.
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
          onClose={() => {
            setTestManagerProblem(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
