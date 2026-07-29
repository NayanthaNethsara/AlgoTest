export type ChallengeStatus = "not_attempted" | "attempted" | "solved";

export type ChallengeProgress = {
  problemId: string;
  status: ChallengeStatus;
  bestScore: number;
};
