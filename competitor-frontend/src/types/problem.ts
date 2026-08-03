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

export type TestMetadata = {
  id: string;
  ordinal: number;
  inputSha: string;
  expectedSha: string;
  points: number;
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

export type ProblemDetail = Problem & {
  createdAt?: string;
  updatedAt?: string;
  published?: boolean;
  maxScore?: number;
  tests?: TestMetadata[];
};

export type ProblemInput = {
  slug: string;
  title: string;
  difficulty: string;
  statement: string;
  constraints?: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  maxScore: number;
  published: boolean;
  samples: Sample[];
};

export type TestCaseInput = {
  ordinal: number;
  input: string;
  expected: string;
  points: number;
};
