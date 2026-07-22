export type Language = {
  id: string;
  label: string;
  monaco: string;
  starter: string;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timeMs: number;
};

export type SubtaskResult = {
  id: number;
  points: number;
  earned: number;
  passed: boolean;
  failedTest?: number;
};

export type SubmitResult = {
  subtasks: SubtaskResult[];
  score: number;
  maxScore: number;
  improvedBest: boolean;
  previousBest: number;
};
