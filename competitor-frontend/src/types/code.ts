import type { SubmissionStatus, SubmissionStatusResponse } from "./submission";

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
  verdict?: string;
  timeMs?: number;
  failedTest?: number;
};

export type SubmitResult = {
  submissionId?: string;
  status?: SubmissionStatus;
  queuePosition?: number;
  error?: string;
  /** Gate refusal code: AGENT_MISSING, AGENT_STALE, AGENT_STOPPED, NOT_ATTESTED. */
  errorCode?: string;
  secondsSincePing?: number;
  subtasks: SubtaskResult[];
  score: number;
  maxScore: number;
  improvedBest: boolean;
  previousBest: number;
  verdict?: Verdict;
  compileError?: string;
};

export type { SubmissionStatusResponse };
