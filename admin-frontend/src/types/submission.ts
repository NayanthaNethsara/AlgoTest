export type SubmissionStatus = "queued" | "running" | "passed" | "failed";

/**
 * The organizer's verdict, which is separate from the judge's. Everything counts
 * until someone rejects it; a rejected submission keeps its score and verdict but
 * stops contributing to the team's best score for that problem.
 */
export type ReviewStatus = "accepted" | "rejected";

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
  reviewStatus?: ReviewStatus;
  reviewReason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};
