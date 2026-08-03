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
  submissionId?: string;
  submission_id?: string;
  problemId?: string;
  problem_id?: string;
  status: SubmissionStatus;
  verdict?: Verdict;
  score: number;
  maxScore?: number;
  max_score?: number;
  queuePosition?: number;
  queue_position?: number;
  compileError?: string;
  compile_error?: string;
  tests?: Array<{
    submissionId?: string;
    submission_id?: string;
    ordinal: number;
    verdict: string;
    timeMs?: number;
    time_ms?: number;
    memoryKb?: number;
    memory_kb?: number;
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
