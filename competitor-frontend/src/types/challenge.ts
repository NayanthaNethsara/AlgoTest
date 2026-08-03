export const CHALLENGE_STATUS = {
  NOT_ATTEMPTED: "not_attempted",
  ATTEMPTED: "attempted",
  SOLVED: "solved",
} as const;

export type ChallengeStatus = (typeof CHALLENGE_STATUS)[keyof typeof CHALLENGE_STATUS];

export type ChallengeProgress = {
  problemId: string;
  status: ChallengeStatus;
  bestScore: number;
};
