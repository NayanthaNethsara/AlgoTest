import { ProblemPanel } from "@/components/problem/problem-panel";
import { CodeWorkspace } from "@/components/workspace/code-workspace";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SAMPLE_PROBLEM } from "@/lib/problems";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="text-sm font-semibold tracking-tight">MiniAlgothon</span>
        <span className="text-sm text-muted-foreground">/ {SAMPLE_PROBLEM.title}</span>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="42" minSize="25">
          <ProblemPanel problem={SAMPLE_PROBLEM} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="58" minSize="35">
          <CodeWorkspace problem={SAMPLE_PROBLEM} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
