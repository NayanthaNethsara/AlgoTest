"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getProblemDetailAction,
  getProblemTestsAction,
  updateProblemAction,
} from "@/lib/actions/problems";
import { ProblemEditor } from "@/components/problem-editor";
import { ErrorState } from "@/components/shell/data-states";
import { PageShell } from "@/components/shell/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncData } from "@/hooks/use-async-data";
import type { ProblemDetail, ProblemInput, TestCaseMetadata } from "@/types/problem";

type EditorData = { problem: ProblemDetail | null; tests: TestCaseMetadata[] };

const EMPTY: EditorData = { problem: null, tests: [] };

export default function EditProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; action?: string }>;
}) {
  const { id } = use(params);
  const resolvedSearchParams = searchParams ? use(searchParams) : undefined;
  const initialTab =
    resolvedSearchParams?.tab === "tests" || resolvedSearchParams?.tab === "samples"
      ? resolvedSearchParams.tab
      : "statement";
  const autoOpenAction =
    resolvedSearchParams?.action === "add" || resolvedSearchParams?.action === "batch"
      ? resolvedSearchParams.action
      : undefined;

  const router = useRouter();
  const [pending, setPending] = useState(false);

  const loader = useCallback(async (): Promise<EditorData> => {
    const [problem, tests] = await Promise.all([
      getProblemDetailAction(id),
      getProblemTestsAction(id).catch(() => [] as TestCaseMetadata[]),
    ]);
    return { problem, tests: tests || [] };
  }, [id]);

  const { data, error, loading, refresh } = useAsyncData(
    loader,
    EMPTY,
    "Failed to load this problem."
  );

  async function handleSave(input: ProblemInput) {
    setPending(true);
    try {
      const res = await updateProblemAction(id, input);
      if (!res.success) {
        throw new Error(res.error || "Failed to save problem");
      }
      router.push("/problems");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <PageShell width="wide">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-96 lg:col-span-4" />
          <Skeleton className="h-96 lg:col-span-8" />
        </div>
      </PageShell>
    );
  }

  if (error || !data.problem) {
    return (
      <PageShell>
        <ErrorState message={error || "Problem not found."} onRetry={refresh} />
      </PageShell>
    );
  }

  return (
    <ProblemEditor
      initialData={data.problem}
      initialTests={data.tests}
      initialTab={initialTab}
      autoOpenAction={autoOpenAction}
      onSave={handleSave}
      pending={pending}
    />
  );
}
