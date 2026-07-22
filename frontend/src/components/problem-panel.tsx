import { Clock, Cpu, Trophy } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Problem, Sample } from "@/lib/problem";

export function ProblemPanel({ problem }: { problem: Problem }) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{problem.title}</h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Meta icon={<Trophy className="size-3.5" />}>{problem.points} points</Meta>
            <Meta icon={<Clock className="size-3.5" />}>
              {problem.timeLimitMs} ms
            </Meta>
            <Meta icon={<Cpu className="size-3.5" />}>
              {problem.memoryLimitMb} MB
            </Meta>
          </div>
        </header>

        <Separator />

        <section>
          <Markdown>{problem.statement}</Markdown>
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle>Samples</SectionTitle>
          {problem.samples.map((sample, index) => (
            <SampleBlock key={index} index={index + 1} sample={sample} />
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Constraints</SectionTitle>
          <Markdown>{problem.constraints}</Markdown>
        </section>

        {problem.subtasks.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionTitle>Subtasks</SectionTitle>
            <div className="flex flex-col gap-2">
              {problem.subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-start justify-between gap-4 rounded-lg border bg-card/50 p-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Subtask {subtask.id}</span>
                    <div className="text-xs text-muted-foreground">
                      <Markdown>{subtask.constraints}</Markdown>
                    </div>
                  </div>
                  <Badge variant="secondary">{subtask.points} pts</Badge>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ScrollArea>
  );
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
      {icon}
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function SampleBlock({ index, sample }: { index: number; sample: Sample }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        Sample {index}
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <IoCell label="Input" value={sample.input} />
        <IoCell label="Output" value={sample.output} />
      </div>
      {sample.explanation && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          <Markdown>{sample.explanation}</Markdown>
        </div>
      )}
    </div>
  );
}

function IoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-3">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <pre className="overflow-x-auto font-mono text-xs leading-relaxed">{value}</pre>
    </div>
  );
}
