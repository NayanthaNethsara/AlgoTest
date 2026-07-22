import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ChallengeProgress, ChallengeStatus } from "@/types/challenge";
import type { Problem } from "@/types/problem";

const STATUS_LABELS: Record<ChallengeStatus, string> = {
  solved: "Solved",
  attempted: "Attempted",
  not_attempted: "Not attempted",
};

const STATUS_STYLES: Record<ChallengeStatus, string> = {
  solved: "bg-success/15 text-success",
  attempted: "bg-chart-3/20 text-chart-3",
  not_attempted: "bg-muted text-muted-foreground",
};

export function ChallengeCard({
  problem,
  progress,
}: {
  problem: Problem;
  progress: ChallengeProgress;
}) {
  return (
    <Link
      href={`/challenges/${problem.id}`}
      className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center gap-3">
        <span className="font-medium">{problem.title}</span>
        <Badge variant="outline">{problem.difficulty}</Badge>
      </div>

      <div className="flex items-center gap-4">
        <Badge className={STATUS_STYLES[progress.status]}>
          {STATUS_LABELS[progress.status]}
        </Badge>
        <span className="w-16 text-right font-mono text-sm tabular-nums text-muted-foreground">
          {progress.bestScore}/{problem.points}
        </span>
      </div>
    </Link>
  );
}
