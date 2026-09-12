"use client";

import { useCallback } from "react";
import { listProblemsAction } from "@/lib/actions/problems";
import { AdminProblems } from "@/components/admin-problems";
import { ErrorState, PageSkeleton } from "@/components/shell/data-states";
import { PageShell } from "@/components/shell/page-shell";
import { useAsyncData } from "@/hooks/use-async-data";
import type { ProblemDetail } from "@/types/problem";

const NO_PROBLEMS: ProblemDetail[] = [];

export default function ProblemsPage() {
  const loader = useCallback(() => listProblemsAction(), []);
  const { data, error, loading, refreshing, refresh } = useAsyncData(
    loader,
    NO_PROBLEMS,
    "Failed to load the problem list."
  );

  return (
    <PageShell>
      {loading ? (
        <PageSkeleton columns={6} />
      ) : error && data.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <AdminProblems
          problems={data}
          refreshing={refreshing}
          loadError={error}
          onRefresh={refresh}
        />
      )}
    </PageShell>
  );
}
