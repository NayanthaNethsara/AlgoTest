import type { Verdict } from "./code";

export type SubmissionStatus = "queued" | "running" | "passed" | "failed";

export type SubmissionSortOption =
  "NEWEST" | "OLDEST" | "SCORE_DESC" | "STATUS_ASC" | "TITLE_ASC";

export type SubmissionItem = {
  id: string;
  submissionId?: string;
  problemTitle: string;
  submittedBy: string;
  teamName: string;
  language: string;
  score: number;
  maxScore: number;
  status: string;
  reviewStatus?: "accepted" | "rejected";
  reviewReason?: string;
  submittedAt: string;
  timestamp?: number;
};

export type ActiveSubmission = {
  id: string;
  problemId: string;
  status: "queued" | "running";
  queuePosition?: number;
};

export type ReviewNotice = {
  submissionId: string;
  reviewStatus: "accepted" | "rejected";
  reviewReason?: string;
};

export type ToastMessage = {
  id: string;
  title: string;
  description: string;
  variant: "success" | "error" | "info";
};

export type SubmissionTestResult = {
  submissionId?: string;
  submission_id?: string;
  ordinal: number;
  verdict?: string;
  timeMs?: number;
  time_ms?: number;
  memoryKb?: number;
  memory_kb?: number;
  points?: number;
};

export type SubmissionStatusResponse = {
  id?: string;
  submissionId?: string;
  submission_id?: string;
  problemId?: string;
  problem_id?: string;
  status?: SubmissionStatus;
  verdict?: Verdict;
  score?: number;
  maxScore?: number;
  max_score?: number;
  queuePosition?: number;
  queue_position?: number;
  compileError?: string;
  compile_error?: string;
  reviewStatus?: "accepted" | "rejected";
  reviewReason?: string;
  tests?: SubmissionTestResult[];
};
