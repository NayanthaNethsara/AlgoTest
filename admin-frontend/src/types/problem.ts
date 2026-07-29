export type Difficulty = "Easy" | "Medium" | "Hard";

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
  slug: string;
  title: string;
  difficulty: Difficulty;
  points?: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  maxScore: number;
  statement: string;
  constraints: string;
  published: boolean;
  createdAt?: string;
  updatedAt?: string;
  samples: Sample[];
  tests?: TestMetadata[];
};

export type ProblemDetail = Problem;

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
