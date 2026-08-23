import { notFound } from "next/navigation";
import { getProblemAction } from "@/actions/problems";
import { ChallengeThemeProvider } from "@/components/problem/challenge-theme-provider";
import { ProblemPanel } from "@/components/problem/problem-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CodeWorkspace } from "@/components/workspace/code-workspace";
import { proctorLocksContest } from "@/lib/proctor";
import { readProctorGate } from "@/lib/proctor-gate";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (proctorLocksContest(await readProctorGate())) return null;

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
