export const CHALLENGE_STATUS = {
  NOT_ATTEMPTED: "not_attempted",
  ATTEMPTED: "attempted",
  SOLVED: "solved",
} as const;

export type ChallengeStatus =
  (typeof CHALLENGE_STATUS)[keyof typeof CHALLENGE_STATUS];

export type ChallengeProgress = {
  problemId: string;
  status: ChallengeStatus;
  bestScore: number;
};

export type ChallengeProgressMap = Record<string, ChallengeProgress>;

export type ChallengeSortOption =
  | "DEFAULT"
  | "POINTS_DESC"
  | "POINTS_ASC"
  | "DIFFICULTY_ASC"
  | "DIFFICULTY_DESC"
  | "TITLE_ASC";

export type ChallengeLayout = "grid" | "list";
