"use client";

import { useCallback, useEffect, useState } from "react";
import { getProblemDetailAction, getProblemTestsAction } from "@/lib/actions/problems";
import type { ProblemDetail, TestCaseMetadata } from "@/types/problem";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shell/data-states";
import { useAsyncData } from "@/hooks/use-async-data";
import { TestCasesTab } from "./problem-editor/test-cases-tab";

type ManagerData = { problem: ProblemDetail | null; tests: TestCaseMetadata[] };

const EMPTY: ManagerData = { problem: null, tests: [] };

type TestCaseManagerProps = {
  problemId: string;
  problemTitle: string;
  onClose: () => void;
};

export function TestCaseManager({ problemId, problemTitle, onClose }: TestCaseManagerProps) {
  const loader = useCallback(async (): Promise<ManagerData> => {
    const [problem, tests] = await Promise.all([
      getProblemDetailAction(problemId),
      getProblemTestsAction(problemId).catch(() => [] as TestCaseMetadata[]),
    ]);
    return { problem, tests: tests || [] };
  }, [problemId]);

  const { data, error, loading, refresh } = useAsyncData(
    loader,
    EMPTY,
    "Failed to load the test cases."
  );

  // Mirrored locally so a batch upload can render each case as it lands rather
  // than re-fetching the whole list per item.
  const [tests, setTests] = useState<TestCaseMetadata[]>(EMPTY.tests);

  useEffect(() => {
    setTests(data.tests);
  }, [data.tests]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{problemTitle}</DialogTitle>
          <DialogDescription>
            Add, replace, inspect, or export the hidden evaluation test cases for this problem.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <TestCasesTab
            problemId={problemId}
            problemSlug={data.problem?.slug || "problem"}
            tests={tests}
            maxScore={data.problem?.maxScore ?? 100}
            onTestsUpdated={setTests}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
