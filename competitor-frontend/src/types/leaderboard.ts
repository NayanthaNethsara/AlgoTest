export type LeaderboardEntry = {
  rank: number;
  teamId: string;
  teamName: string;
  totalScore: number;
  problemsSolved: number;
  lastSubmissionAt?: string;
};

export type LeaderboardSortOption =
  "RANK_ASC" | "SCORE_DESC" | "SCORE_ASC" | "SOLVED_DESC" | "NAME_ASC";
