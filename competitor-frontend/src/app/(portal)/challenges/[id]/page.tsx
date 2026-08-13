import { notFound } from "next/navigation";
import { ProblemPanel } from "@/components/problem/problem-panel";
import { CodeWorkspace } from "@/components/workspace/code-workspace";
import { ChallengeThemeProvider } from "@/components/providers/challenge-theme-provider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { getProblemAction } from "@/actions/problems";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const problem = await getProblemAction(id);
  if (!problem) notFound();

  return (
    <ChallengeThemeProvider>
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize="42" minSize="25">
          <ProblemPanel problem={problem} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="58" minSize="35">
          <CodeWorkspace problem={problem} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </ChallengeThemeProvider>
  );
}
