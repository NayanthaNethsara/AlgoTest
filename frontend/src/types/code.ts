export type Language = {
  id: string;
  label: string;
  monaco: string;
  starter: string;
};

export type Verdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "OLE" | "IE" | "SK";

export type RunResult = {
  stdout: string;
  stderr: string;
  compileError?: string;
  exitCode: number;
  timeMs: number;
  memoryKb?: number;
  verdict?: Verdict;
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
