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

export type Problem = {
  id: string;
  title: string;
  points: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  statement: string;
  constraints: string;
  samples: Sample[];
  subtasks: Subtask[];
};
