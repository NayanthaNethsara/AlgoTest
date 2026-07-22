import type { ChallengeProgress } from "@/types/challenge";

// Mocked until submissions are tracked per user in the backend.
const PROGRESS: ChallengeProgress[] = [
  { problemId: "range-sum", status: "solved", bestScore: 100 },
  { problemId: "two-sum-count", status: "attempted", bestScore: 25 },
  { problemId: "longest-common-prefix", status: "not_attempted", bestScore: 0 },
];

export function getChallengeProgress(problemId: string): ChallengeProgress {
  return (
    PROGRESS.find((progress) => progress.problemId === problemId) ?? {
      problemId,
      status: "not_attempted",
      bestScore: 0,
    }
  );
}
