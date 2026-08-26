export const DIFFICULTY = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
} as const;

export type Difficulty = (typeof DIFFICULTY)[keyof typeof DIFFICULTY];

export type Sample = {
  id?: string;
  ordinal?: number;
  input: string;
  output: string;
  explanation?: string;
};

export type Problem = {
  id: string;
  slug?: string;
  title: string;
  difficulty: Difficulty;
  points: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  statement: string;
  constraints: string;
  samples: Sample[];
  subtasks?: { id: number; points: number; constraints: string }[];
};

export type ChallengeThemeMode = "dark" | "light";
