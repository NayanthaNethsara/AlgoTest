import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  Trophy,
} from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { CHALLENGE_STATUS_LABELS } from "@/lib/constants";
import { CHALLENGE_STATUS, type ChallengeProgress } from "@/types/challenge";
import { DIFFICULTY, type Difficulty, type Problem } from "@/types/problem";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const DIFFICULTY_VARIANTS: Record<Difficulty, BadgeVariant> = {
  [DIFFICULTY.EASY]: "success",
  [DIFFICULTY.MEDIUM]: "teal",
  [DIFFICULTY.HARD]: "tealDeep",
};

export function ChallengeCard({
  problem,
  progress = {
    problemId: problem.id,
    status: CHALLENGE_STATUS.NOT_ATTEMPTED,
    bestScore: 0,
  },
  layout = "grid",
}: {
  problem: Problem;
  progress?: ChallengeProgress;
  layout?: "grid" | "list";
}) {
  const isSolved = progress.status === CHALLENGE_STATUS.SOLVED;
  const isAttempted = progress.status === CHALLENGE_STATUS.ATTEMPTED;
  const difficultyVariant =
    DIFFICULTY_VARIANTS[problem.difficulty] ??
    DIFFICULTY_VARIANTS[DIFFICULTY.EASY];
  const statusVariant: BadgeVariant = isSolved
    ? "success"
    : isAttempted
      ? "warning"
      : "secondary";

  if (layout === "grid") {
    return (
      <Link
        href={`/challenges/${problem.slug || problem.id}`}
        className="group flex flex-col justify-between gap-4 pixel-raised bg-card p-5 transition-colors hover:border-primary/50"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant={difficultyVariant}
              className="text-[10px] uppercase px-2 py-0.5"
            >
              {problem.difficulty}
            </Badge>

            <Badge
              variant={statusVariant}
              className="gap-1.5 text-[10px] uppercase px-2 py-0.5"
            >
              {isSolved ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : isAttempted ? (
                <Clock className="h-3 w-3" />
              ) : (
                <HelpCircle className="h-3 w-3" />
              )}
              {CHALLENGE_STATUS_LABELS[progress.status]}
            </Badge>
          </div>

          <div>
            <h3 className="font-bold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors leading-snug">
              {problem.title}
            </h3>
            {problem.statement && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                {problem.statement}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t-2 border-border pt-3 mt-1">
          <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-foreground">{progress.bestScore}</span> /{" "}
            {problem.points} XP
          </div>

          <div className="flex h-8 w-8 items-center justify-center pixel-flat bg-primary text-primary-foreground transition-transform group-hover:scale-105">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/challenges/${problem.slug || problem.id}`}
      className="group flex items-center justify-between gap-4 pixel-raised bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="font-bold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors truncate">
            {problem.title}
          </span>
          <Badge
            variant={difficultyVariant}
            className="text-[10px] uppercase shrink-0 px-2 py-0.5"
          >
            {problem.difficulty}
          </Badge>
        </div>
        {problem.statement && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {problem.statement}
          </p>
        )}
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <div className="flex flex-col items-end gap-1">
          <Badge
            variant={statusVariant}
            className="gap-1.5 text-[10px] uppercase px-2 py-0.5"
          >
            {isSolved ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : isAttempted ? (
              <Clock className="h-3 w-3" />
            ) : (
              <HelpCircle className="h-3 w-3" />
            )}
            {CHALLENGE_STATUS_LABELS[progress.status]}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <strong className="text-foreground">
              {progress.bestScore}
            </strong> / {problem.points} XP
          </div>
        </div>

        <div className="flex h-8.5 w-8.5 items-center justify-center pixel-flat bg-primary text-primary-foreground transition-transform group-hover:scale-105">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
