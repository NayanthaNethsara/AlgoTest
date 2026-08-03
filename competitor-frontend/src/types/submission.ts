import type { Verdict } from "./code";

export type SubmissionStatus = "queued" | "running" | "passed" | "failed";

export type SubmissionTest = {
  submissionId: string;
  ordinal: number;
  verdict: Verdict | string;
  timeMs: number;
  memoryKb: number;
  points: number;
};

export type SubmissionStatusResponse = {
  submission_id: string;
  problem_id: string;
  status: SubmissionStatus;
  verdict?: Verdict;
  score: number;
  max_score: number;
  queue_position?: number;
  compile_error?: string;
  tests?: Array<{
    submission_id: string;
    ordinal: number;
    verdict: string;
    time_ms: number;
    memory_kb: number;
    points: number;
  }>;
};

export type Submission = {
  id: string;
  problemId?: string;
  userId?: string;
  teamId?: string;
  language: string;
  code: string;
  status: SubmissionStatus;
  output?: string;
  verdict?: Verdict;
  score?: number;
  maxScore?: number;
  queuePosition?: number;
  compileError?: string;
  createdAt?: string;
  finishedAt?: string;
};
