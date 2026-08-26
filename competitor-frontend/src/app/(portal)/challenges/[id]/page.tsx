import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, PauseCircle } from "lucide-react";
import { getContestStateAction } from "@/actions/contest";
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
import { CONTEST_STATUS } from "@/types/contest";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const proctor = await readProctorGate();
  if (proctorLocksContest(proctor)) return null;

  const contestState = await getContestStateAction();
  if (contestState.status === CONTEST_STATUS.PAUSED) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center">
        <div className="max-w-md pixel-raised bg-card p-8 flex flex-col items-center gap-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 pixel-flat">
            <PauseCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Contest is Paused</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The competition has been temporarily paused by organizers. Challenge workspaces and execution will unlock automatically once the contest resumes.
          </p>
          <Link
            href="/challenges"
            className="mt-2 pixel-flat bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Back to Challenges
          </Link>
        </div>
      </div>
    );
  }

  if (contestState.status === CONTEST_STATUS.NOT_STARTED) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center">
        <div className="max-w-md pixel-raised bg-card p-8 flex flex-col items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary pixel-flat">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Contest Has Not Started</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Challenges are locked until the competition countdown reaches zero.
          </p>
          <Link
            href="/challenges"
            className="mt-2 pixel-flat bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Back to Challenges
          </Link>
        </div>
      </div>
    );
  }

  const problem = await getProblemAction(id);
  if (!problem) {
    if (proctor && !proctor.allowed) return null;
    notFound();
  }

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
