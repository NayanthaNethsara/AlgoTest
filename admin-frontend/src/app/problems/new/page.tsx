"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ProblemEditor } from "@/components/problem-editor";
import type { ProblemInput } from "@/types/problem";

export default function NewProblemPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSave(input: ProblemInput) {
    setPending(true);
    try {
      const res = await apiFetch("/api/v1/admin/problems", {
        method: "POST",
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to create problem");
      }

      router.push("/");
    } finally {
      setPending(false);
    }
  }

  return <ProblemEditor onSave={handleSave} pending={pending} />;
}
