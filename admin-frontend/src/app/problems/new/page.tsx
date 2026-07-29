"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProblemAction } from "@/lib/actions/problems";
import { ProblemEditor } from "@/components/problem-editor";
import type { ProblemInput } from "@/types/problem";

export default function NewProblemPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSave(input: ProblemInput) {
    setPending(true);
    try {
      await createProblemAction(input);
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return <ProblemEditor onSave={handleSave} pending={pending} />;
}
