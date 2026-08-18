"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  getProblemDetailAction,
  getProblemTestsAction,
  updateProblemAction,
} from "@/lib/actions/problems";
import { ProblemEditor } from "@/components/problem-editor";
import type { ProblemDetail, ProblemInput, TestCaseInput } from "@/types/problem";

export default function EditProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [tests, setTests] = useState<TestCaseInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [problemData, testsData] = await Promise.all([
          getProblemDetailAction(id),
          getProblemTestsAction(id).catch(() => []),
        ]);
        setProblem(problemData);
        setTests(testsData || []);
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message);
        else setError("Failed to load problem.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSave(input: ProblemInput) {
    setPending(true);
    try {
      await updateProblemAction(id, input);
      router.push("/");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground font-medium">
        Loading problem details...
      </div>
    );
  }

  if (error || !problem) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-xs text-destructive mb-4 font-medium">{error || "Problem not found."}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 text-xs rounded bg-primary text-primary-foreground font-medium"
        >
          Return to Console
        </button>
      </div>
    );
  }

  return (
    <ProblemEditor
      initialData={problem}
      initialTests={tests}
      onSave={handleSave}
      pending={pending}
    />
  );
}
