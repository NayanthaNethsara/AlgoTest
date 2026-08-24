import { z } from "zod";

export const reviewSubmissionSchema = z.object({
  status: z.enum(["accepted", "rejected"], {
    message: "Review status must be either 'accepted' or 'rejected'",
  }),
  reason: z
    .string()
    .max(500, "Review reason must be 500 characters or less")
    .optional(),
});

export const rejudgeSubmissionSchema = z.object({
  submissionId: z.string().min(1, "Submission ID is required"),
});

export const rejudgeProblemSchema = z.object({
  problemId: z.string().min(1, "Problem ID is required"),
});

export const cancelSubmissionSchema = z.object({
  submissionId: z.string().min(1, "Submission ID is required"),
});

export type ValidatedReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
export type ValidatedRejudgeSubmission = z.infer<typeof rejudgeSubmissionSchema>;
export type ValidatedRejudgeProblem = z.infer<typeof rejudgeProblemSchema>;
export type ValidatedCancelSubmission = z.infer<typeof cancelSubmissionSchema>;
