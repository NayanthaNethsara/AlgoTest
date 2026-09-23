"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock, Copy, Cpu, Trophy } from "lucide-react";
import { Markdown } from "@/components/common/markdown";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChallengeThemeSwitcher } from "@/components/problem/theme-switcher";
import type { Problem, Sample } from "@/types/problem";

export function ProblemPanel({ problem }: { problem: Problem }) {
  return (
    <ScrollArea className="h-full font-mono">
      <div className="flex flex-col gap-6 p-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/challenges"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pixel-flat bg-card hover:bg-muted px-2.5 py-1 transition-colors select-none"
              title="Return to challenge list"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Challenges</span>
            </Link>
            <ChallengeThemeSwitcher />
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            <h1 className="text-lg font-semibold leading-snug text-foreground">
              {problem.title}
            </h1>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Meta icon={<Trophy className="size-3.5" />}>
                {problem.points} points
              </Meta>
              <Meta icon={<Clock className="size-3.5" />}>
                {problem.timeLimitMs} ms
              </Meta>
              <Meta icon={<Cpu className="size-3.5" />}>
                {problem.memoryLimitMb} MB
              </Meta>
            </div>
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

        {Boolean(problem.subtasks && problem.subtasks.length > 0) && (
          <section className="flex flex-col gap-2">
            <SectionTitle>Subtasks</SectionTitle>
            <div className="flex flex-col gap-2">
              {problem.subtasks?.map((subtask) => (
                <div
                  key={subtask.id}
                  className="pixel-inset flex items-start justify-between gap-4 bg-input p-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      Subtask {subtask.id}
                    </span>
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

function Meta({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 pixel-flat bg-muted px-2 py-1">
      {icon}
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="pixel-label pixel-prompt">{children}</h2>;
}

function SampleBlock({ index, sample }: { index: number; sample: Sample }) {
  return (
    <div className="pixel-raised overflow-hidden">
      <div className="border-b-2 border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Sample {index}
      </div>
      <div className="grid gap-0.5 bg-border sm:grid-cols-2">
        <IoCell label="Input" value={sample.input} />
        <IoCell label="Output" value={sample.output} />
      </div>
      {sample.explanation && (
        <div className="border-t-2 border-border px-3 py-2 text-xs text-muted-foreground">
          <Markdown>{sample.explanation}</Markdown>
        </div>
      )}
    </div>
  );
}

function IoCell({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-card p-3 group relative">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 pixel-flat bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          title={`Copy sample ${label.toLowerCase()}`}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto font-mono text-xs leading-relaxed select-all">
        {value}
      </pre>
    </div>
  );
}
