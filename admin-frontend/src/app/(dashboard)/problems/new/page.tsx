"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProblemAction } from "@/lib/actions/problems";
import { ProblemEditor } from "@/components/problem-editor";
import type { ProblemInput } from "@/types/problem";

export default function NewProblemPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSave(input: ProblemInput, action?: "add" | "batch") {
    setPending(true);
    try {
      const res = await createProblemAction(input);
      if (!res.success) {
        throw new Error(res.error || "Failed to create problem");
      }
      if (input.published) {
        router.push("/problems");
      } else {
        const actionParam = action ? `&action=${action}` : "";
        router.replace(`/problems/${res.problem.id}/edit?tab=tests${actionParam}`);
      }
    } finally {
      setPending(false);
    }
  }

  return <ProblemEditor onSave={handleSave} pending={pending} />;
}
