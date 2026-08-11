"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { ProblemPanel } from "@/components/problem/problem-panel";
import { CodeWorkspace } from "@/components/workspace/code-workspace";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { getProblemAction } from "@/actions/problems";
import type { Problem } from "@/types/problem";
import { Loader2 } from "lucide-react";

export function ChallengeDetailClient({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProblemAction(id).then((res) => {
      setProblem(res);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 pixel-spin text-primary" />
      </div>
    );
  }

  if (!problem) return notFound();

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="42" minSize="25">
        <ProblemPanel problem={problem} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="58" minSize="35">
        <CodeWorkspace problem={problem} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
