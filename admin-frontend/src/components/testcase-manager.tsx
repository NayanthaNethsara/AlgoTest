"use client";

import { useState, useEffect } from "react";
import {
  getProblemDetailAction,
  getProblemTestsAction,
} from "@/lib/actions/problems";
import type { ProblemDetail, TestCaseMetadata } from "@/types/problem";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TestCasesTab } from "./problem-editor/test-cases-tab";
import { Loader2 } from "lucide-react";

type TestCaseManagerProps = {
  problemId: string;
  problemTitle: string;
  onClose: () => void;
};

export function TestCaseManager({ problemId, problemTitle, onClose }: TestCaseManagerProps) {
  const [problemDetail, setProblemDetail] = useState<ProblemDetail | null>(null);
  const [tests, setTests] = useState<TestCaseMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [data, testsData] = await Promise.all([
          getProblemDetailAction(problemId),
          getProblemTestsAction(problemId).catch(() => []),
        ]);
        setProblemDetail(data);
        setTests(testsData || []);
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message);
        else setError("Failed to load test cases.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [problemId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-6">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="text-base font-semibold">{problemTitle}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Granular evaluation test case management console. Add part-by-part, replace, or export.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-64 items-center justify-center text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading test cases...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-destructive">{error}</div>
        ) : (
          <div className="pt-2">
            <TestCasesTab
              problemId={problemId}
              problemSlug={problemDetail?.slug || "problem"}
              tests={tests}
              maxScore={problemDetail?.maxScore ?? 100}
              onTestsUpdated={setTests}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
