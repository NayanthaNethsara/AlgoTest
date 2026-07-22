export type Sample = {
  input: string;
  output: string;
  explanation?: string;
};

export type Subtask = {
  id: number;
  points: number;
  constraints: string;
};

export type Difficulty = "Easy" | "Medium" | "Hard";

export type Problem = {
  id: string;
  title: string;
  difficulty: Difficulty;
  points: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  statement: string;
  constraints: string;
  samples: Sample[];
  subtasks: Subtask[];
};
