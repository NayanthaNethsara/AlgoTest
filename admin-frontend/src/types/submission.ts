export type SubmissionStatus = "queued" | "running" | "passed" | "failed";

export type AdminSubmission = {
  submissionId: string;
  userId: string;
  teamId: string;
  problemId: string;
  userName: string;
  userEmail: string;
  teamName: string;
  problemTitle: string;
  language: string;
  code: string;
  status: SubmissionStatus;
  verdict?: string;
  score: number;
  maxScore: number;
  testsTotal: number;
  testsDone: number;
  compileError?: string;
  createdAt: string;
  finishedAt?: string;
};
