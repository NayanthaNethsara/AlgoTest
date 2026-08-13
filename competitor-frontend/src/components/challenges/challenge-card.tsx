import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, HelpCircle, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CHALLENGE_STATUS, type ChallengeProgress, type ChallengeStatus } from "@/types/challenge";
import { DIFFICULTY, type Difficulty, type Problem } from "@/types/problem";

const STATUS_LABELS: Record<ChallengeStatus, string> = {
  [CHALLENGE_STATUS.SOLVED]: "SOLVED",
  [CHALLENGE_STATUS.ATTEMPTED]: "IN PROGRESS",
  [CHALLENGE_STATUS.NOT_ATTEMPTED]: "UNOPENED",
};

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  [DIFFICULTY.EASY]: "bg-emerald-950/90 text-emerald-300 border-emerald-500/60",
  [DIFFICULTY.MEDIUM]: "bg-amber-950/90 text-amber-300 border-amber-500/60",
  [DIFFICULTY.HARD]: "bg-rose-950/90 text-rose-300 border-rose-500/60",
};

export function ChallengeCard({
  problem,
  progress = { problemId: problem.id, status: CHALLENGE_STATUS.NOT_ATTEMPTED, bestScore: 0 },
  layout = "grid",
}: {
  problem: Problem;
  progress?: ChallengeProgress;
  layout?: "grid" | "list";
}) {
  const isSolved = progress.status === CHALLENGE_STATUS.SOLVED;
  const isAttempted = progress.status === CHALLENGE_STATUS.ATTEMPTED;
  const difficultyStyle = DIFFICULTY_STYLES[problem.difficulty] || DIFFICULTY_STYLES[DIFFICULTY.EASY];

  if (layout === "grid") {
    return (
      <Link
        href={`/challenges/${problem.slug || problem.id}`}
        className="group flex flex-col justify-between gap-4 border-2 border-black bg-card p-5 shadow-[inset_2px_2px_0px_var(--bevel-light),inset_-2px_-2px_0px_var(--bevel-dark),0px_4px_0px_#000000] transition-all hover:border-primary hover:-translate-y-1"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="outline"
              className={`font-pixel-body text-[10px] uppercase border px-2 py-0.5 ${difficultyStyle}`}
            >
              {problem.difficulty}
            </Badge>

            <Badge
              variant="secondary"
              className={`gap-1.5 text-[10px] uppercase border-black ${
                isSolved
                  ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                  : isAttempted
                  ? "bg-amber-950 text-amber-300 border-amber-500"
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
          </div>

          <div>
            <h3 className="font-pixel-header text-sm text-foreground group-hover:text-primary transition-colors uppercase tracking-wider pixel-text-shadow leading-snug">
              {problem.title}
            </h3>
            {problem.statement && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2 font-pixel-body leading-relaxed">
                {problem.statement}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t-2 border-black/40 pt-3 mt-1 font-pixel-body">
          <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-foreground">{progress.bestScore}</span> / {problem.points} XP
          </div>

          <div className="flex h-8 w-8 items-center justify-center border-2 border-black bg-primary text-primary-foreground shadow-[inset_1.5px_1.5px_0px_rgba(255,255,255,0.4),0px_2px_0px_#000000] transition-transform group-hover:scale-105">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/challenges/${problem.slug || problem.id}`}
      className="group flex items-center justify-between gap-4 border-2 border-black bg-card p-4 shadow-[inset_2px_2px_0px_var(--bevel-light),inset_-2px_-2px_0px_var(--bevel-dark),0px_4px_0px_#000000] transition-all hover:border-primary hover:-translate-y-0.5"
    >
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-pixel-header text-xs text-foreground group-hover:text-primary transition-colors uppercase tracking-wider pixel-text-shadow truncate">
            {problem.title}
          </span>
          <Badge
            variant="outline"
            className={`font-pixel-body text-[10px] uppercase border shrink-0 ${difficultyStyle}`}
          >
            {problem.difficulty}
          </Badge>
        </div>
        {problem.statement && (
          <p className="text-xs text-muted-foreground line-clamp-1 font-pixel-body">
            {problem.statement}
          </p>
        )}
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <div className="flex flex-col items-end gap-1 font-pixel-body">
          <Badge
            variant="secondary"
            className={`gap-1.5 text-[10px] uppercase border-black ${
              isSolved
                ? "bg-emerald-900 text-emerald-300 border-emerald-500"
                : isAttempted
                ? "bg-amber-900 text-amber-300 border-amber-500"
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
          <div className="flex items-center gap-1 text-xs font-pixel-body text-amber-400">
            <Trophy className="h-3 w-3 text-amber-400" />
            <strong className="text-foreground">{progress.bestScore}</strong> / {problem.points} XP
          </div>
        </div>

        <div className="flex h-9 w-9 items-center justify-center border-2 border-black bg-primary text-primary-foreground shadow-[inset_2px_2px_0px_rgba(255,255,255,0.4),0px_2px_0px_#000000] transition-transform group-hover:scale-105">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
