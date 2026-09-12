"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  FileCode2Icon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { togglePublishAction, deleteProblemAction } from "@/lib/actions/problems";
import type { ProblemDetail } from "@/types/problem";
import { getErrorMessage } from "@/lib/errors";
import { TestCaseManager } from "./testcase-manager";
import { ConfirmDialog } from "./confirm-dialog";
import { DataPagination } from "@/components/shell/data-pagination";
import { EmptyState } from "@/components/shell/data-states";
import { PageHeader } from "@/components/shell/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";

const MIN_TESTS_TO_PUBLISH = 5;

const DIFFICULTY_OPTIONS = [
  { value: "all", label: "All difficulties" },
  { value: "Easy", label: "Easy" },
  { value: "Medium", label: "Medium" },
  { value: "Hard", label: "Hard" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

const DIFFICULTY_STYLES: Record<string, string> = {
  Easy: "border-success/30 bg-success/10 text-success",
  Medium: "border-warning/30 bg-warning/10 text-warning",
  Hard: "border-destructive/30 bg-destructive/10 text-destructive",
};

function testCountOf(problem: ProblemDetail) {
  return problem.testCount ?? problem.tests?.length ?? 0;
}

export function AdminProblems({
  problems,
  onRefresh,
  refreshing = false,
  loadError = null,
}: {
  problems: ProblemDetail[];
  onRefresh: () => void;
  refreshing?: boolean;
  loadError?: string | null;
}) {
  const [testManagerProblem, setTestManagerProblem] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deletingProblem, setDeletingProblem] = useState<ProblemDetail | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const pagination = usePagination(filteredProblems);

  const hasActiveFilters =
    searchQuery.trim().length > 0 || difficultyFilter !== "all" || statusFilter !== "all";

  const publishedCount = problems.filter((p) => p.published).length;

  function clearFilters() {
    setSearchQuery("");
    setDifficultyFilter("all");
    setStatusFilter("all");
  }

  async function handleTogglePublish(problem: ProblemDetail) {
    const testCount = testCountOf(problem);
    if (!problem.published && testCount < MIN_TESTS_TO_PUBLISH) {
      toast.warning(`"${problem.title}" needs more test cases`, {
        description: `At least ${MIN_TESTS_TO_PUBLISH} evaluation tests are required before publishing — it currently has ${testCount}.`,
        action: {
          label: "Add tests",
          onClick: () => setTestManagerProblem({ id: problem.id, title: problem.title }),
        },
      });
      return;
    }

    setPendingId(problem.id);
    try {
      await togglePublishAction(problem.id, !problem.published);
      toast.success(problem.published ? "Problem unpublished" : "Problem published", {
        description: problem.title,
      });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to change the publish state."));
    } finally {
      setPendingId(null);
    }
  }

  async function confirmDeleteProblem() {
    if (!deletingProblem) return;
    const target = deletingProblem;
    setDeletingProblem(null);
    setPendingId(target.id);
    try {
      await deleteProblemAction(target.id);
      toast.success("Problem deleted", { description: target.title });
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete the problem."));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Problems"
        description={
          <>
            {problems.length} problem{problems.length === 1 ? "" : "s"} · {publishedCount} published
            {hasActiveFilters && ` · ${filteredProblems.length} matching filters`}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              {refreshing ? <Spinner /> : <RefreshCwIcon />} Refresh
            </Button>
            <Link
              href="/problems/new"
              className={buttonVariants({ size: "sm", className: "gap-1.5" })}
            >
              <PlusIcon /> Create problem
            </Link>
          </>
        }
      />

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Showing the last loaded data</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search by title or slug…"
          className="sm:max-w-xs"
        />
        <div className="flex items-center gap-2">
          <SimpleSelect
            value={difficultyFilter}
            onValueChange={setDifficultyFilter}
            options={DIFFICULTY_OPTIONS}
            aria-label="Filter by difficulty"
            className="w-full text-xs sm:w-40"
          />
          <SimpleSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={STATUS_OPTIONS}
            aria-label="Filter by status"
            className="w-full text-xs sm:w-36"
          />
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="shrink-0 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {filteredProblems.length === 0 ? (
        <EmptyState
          icon={<FileCode2Icon />}
          title={hasActiveFilters ? "No matching problems" : "No problems yet"}
          description={
            hasActiveFilters
              ? "No problem matches the current search or filters."
              : "Create the first problem, or import a set using the CLI importer."
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Reset filters
              </Button>
            ) : (
              <Link
                href="/problems/new"
                className={buttonVariants({ size: "sm", className: "gap-1.5" })}
              >
                <PlusIcon /> Create problem
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Title &amp; slug</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead>Test cases</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.items.map((p) => {
                const testCount = testCountOf(p);
                const hasEnoughTests = testCount >= MIN_TESTS_TO_PUBLISH;
                const busy = pendingId === p.id;

                return (
                  <TableRow
                    key={p.id}
                    data-busy={busy || undefined}
                    className="data-busy:opacity-60"
                  >
                    <TableCell className="max-w-72">
                      <div className="truncate text-xs font-medium">{p.title}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {p.slug}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-[11px]", DIFFICULTY_STYLES[p.difficulty])}
                      >
                        {p.difficulty}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.timeLimitMs}ms · {p.memoryLimitMb}MB
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs font-medium">
                      {p.maxScore}
                    </TableCell>

                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={() => setTestManagerProblem({ id: p.id, title: p.title })}
                              className="flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            />
                          }
                        >
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1 font-mono text-[11px] transition-colors",
                              hasEnoughTests
                                ? "hover:border-primary/50 hover:bg-primary/5"
                                : "border-warning/40 bg-warning/10 text-warning hover:border-warning"
                            )}
                          >
                            <LayersIcon className="size-3" />
                            {testCount}
                          </Badge>
                          {!hasEnoughTests && <AlertTriangleIcon className="size-3 text-warning" />}
                        </TooltipTrigger>
                        <TooltipContent>
                          {hasEnoughTests
                            ? "Manage test cases"
                            : `Needs at least ${MIN_TESTS_TO_PUBLISH} tests to publish`}
                        </TooltipContent>
                      </Tooltip>
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
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleTogglePublish(p)}
                                disabled={busy}
                                aria-label={p.published ? "Unpublish problem" : "Publish problem"}
                              />
                            }
                          >
                            {busy ? (
                              <Spinner />
                            ) : p.published ? (
                              <EyeOffIcon />
                            ) : (
                              <EyeIcon className={hasEnoughTests ? "text-primary" : undefined} />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            {p.published
                              ? "Unpublish"
                              : hasEnoughTests
                                ? "Publish"
                                : `Needs ${MIN_TESTS_TO_PUBLISH} tests to publish`}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setTestManagerProblem({ id: p.id, title: p.title })}
                                aria-label="Manage test cases"
                              />
                            }
                          >
                            <LayersIcon />
                          </TooltipTrigger>
                          <TooltipContent>Manage test cases</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Link
                                href={`/problems/${p.id}/edit`}
                                aria-label={`Edit ${p.title}`}
                                className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                              />
                            }
                          >
                            <PencilIcon />
                          </TooltipTrigger>
                          <TooltipContent>Edit problem</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setDeletingProblem(p)}
                                disabled={busy}
                                aria-label={`Delete ${p.title}`}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              />
                            }
                          >
                            <Trash2Icon />
                          </TooltipTrigger>
                          <TooltipContent>Delete problem</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <DataPagination state={pagination} itemLabel="problem" />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletingProblem)}
        onOpenChange={(open) => !open && setDeletingProblem(null)}
        title="Delete problem"
        description={
          <>
            Permanently delete <strong className="text-foreground">{deletingProblem?.title}</strong>{" "}
            ({deletingProblem?.slug})? This erases the statement, samples, and every uploaded test
            case file.
          </>
        }
        actionLabel="Delete problem"
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
