import type { Verdict } from "./code";

export type SubmissionStatus = "queued" | "running" | "passed" | "failed";

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
  createdAt?: string;
};
