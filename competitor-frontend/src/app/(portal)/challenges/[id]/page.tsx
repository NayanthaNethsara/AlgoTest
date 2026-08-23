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
import { readProctorGate } from "@/lib/proctor-gate";
import { proctorLocksContest } from "@/lib/proctor";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Ordered, not parallel: fetching the statement and then declining to render it
  // still ships it to a locked contestant in the RSC payload. The lock screen the
  // portal layout renders is the whole response in that case.
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
