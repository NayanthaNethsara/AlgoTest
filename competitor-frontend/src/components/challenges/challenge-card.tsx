import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ChallengeProgress, ChallengeStatus } from "@/types/challenge";
import type { Problem } from "@/types/problem";

const STATUS_LABELS: Record<ChallengeStatus, string> = {
  solved: "Solved",
  attempted: "Attempted",
  not_attempted: "Not attempted",
};

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  hard: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

export function ChallengeCard({
  problem,
  progress,
}: {
  problem: Problem;
  progress: ChallengeProgress;
}) {
  const isSolved = progress.status === "solved";
  const isAttempted = progress.status === "attempted";
  const difficultyKey = (problem.difficulty || "medium").toLowerCase();

  return (
    <Link
      href={`/challenges/${problem.id}`}
      className="group flex items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
            {problem.title}
          </span>
          <Badge
            variant="outline"
            className={`font-mono text-[11px] capitalize ${DIFFICULTY_STYLES[difficultyKey] || ""}`}
          >
            {problem.difficulty}
          </Badge>
        </div>
        {problem.statement && (
          <p className="text-xs text-muted-foreground line-clamp-1 max-w-xl">
            {problem.statement}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="flex flex-col items-end gap-1">
          <Badge
            variant="secondary"
            className={`gap-1 text-[11px] font-medium ${
              isSolved
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : isAttempted
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isSolved ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : isAttempted ? (
              <Clock className="h-3 w-3" />
            ) : (
              <HelpCircle className="h-3 w-3" />
            )}
            {STATUS_LABELS[progress.status]}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            <strong className="text-foreground">{progress.bestScore}</strong> / {problem.points} pts
          </span>
        </div>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
