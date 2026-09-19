import type { Verdict } from "./code";

export type SubmissionStatus = "queued" | "running" | "passed" | "failed";

export type SubmissionSortOption =
  "NEWEST" | "OLDEST" | "SCORE_DESC" | "STATUS_ASC" | "TITLE_ASC";

export type SubmissionItem = {
  id: string;
  submissionId: string;
  problemTitle: string;
  submittedBy: string;
  teamName: string;
  language: string;
  code?: string;
  score: number;
  maxScore: number;
  status: string;
  reviewStatus?: "accepted" | "rejected";
  reviewReason?: string;
  submittedAt: string;
  timestamp: number;
};

export type ActiveSubmission = {
  id: string;
  problemId: string;
  status: "queued" | "running";
  queuePosition?: number;
  testsDone?: number;
  testsTotal?: number;
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
  submissionId: string;
  ordinal: number;
  verdict: string;
  timeMs: number;
  memoryKb: number;
  points: number;
  maxPoints: number;
};

export type SubmissionStatusResponse = {
  submissionId: string;
  userId: string;
  teamId: string;
  problemId: string;
  status: SubmissionStatus;
  verdict?: Verdict;
  score: number;
  maxScore: number;
  testsTotal: number;
  testsDone: number;
  compileError?: string;
  queuePosition?: number;
  tests?: SubmissionTestResult[];
  createdAt: string;
  finishedAt?: string;
  reviewStatus?: "accepted" | "rejected";
  reviewReason?: string;
  reviewedAt?: string;
};

export type BackendSubmissionItem = SubmissionStatusResponse & {
  userName: string;
  userEmail: string;
  teamName: string;
  problemTitle: string;
  language: string;
  code: string;
  reviewedBy?: string;
};
