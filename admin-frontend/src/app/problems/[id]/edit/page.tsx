"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getJson } from "@/lib/api";
import { ProblemEditor } from "@/components/problem-editor";
import type { ProblemDetail, ProblemInput } from "@/types/problem";

export default function EditProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getJson<{ problem: ProblemDetail }>(`/api/v1/admin/problems/${id}`);
        setProblem(data.problem);
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
      const res = await apiFetch(`/api/v1/admin/problems/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to update problem");
      }

      router.push("/");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading problem details...
      </div>
    );
  }

  if (error || !problem) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-sm text-red-500 mb-4">{error || "Problem not found."}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium"
        >
          Return to Console
        </button>
      </div>
    );
  }

  return <ProblemEditor initialData={problem} onSave={handleSave} pending={pending} />;
}
