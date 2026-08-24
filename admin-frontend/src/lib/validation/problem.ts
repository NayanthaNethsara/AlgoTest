import { z } from "zod";

export const sampleSchema = z.object({
  id: z.string().optional(),
  ordinal: z.number().int().positive().optional(),
  input: z.string().min(1, "Sample input is required"),
  output: z.string().min(1, "Sample output is required"),
  explanation: z.string().optional(),
});

export const testCaseInputSchema = z.object({
  ordinal: z.number().int().positive().optional(),
  input: z.string().min(1, "Test input is required"),
  expected: z.string().min(1, "Expected output is required"),
  points: z.number().int().nonnegative("Points must be 0 or positive"),
});

export const problemInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Slug is required")
      .regex(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
        "Slug must be lowercase alphanumeric and hyphens only (e.g. 'two-sum')"
      ),
    title: z.string().trim().min(1, "Title is required").max(120, "Title must be 120 characters or less"),
    difficulty: z.enum(["Easy", "Medium", "Hard"], {
      error: "Difficulty must be Easy, Medium, or Hard",
    }),
    statement: z.string().trim().min(1, "Problem statement is required"),
    constraints: z.string().default(""),
    timeLimitMs: z
      .number({ message: "Time limit must be a number" })
      .int()
      .min(100, "Time limit must be at least 100ms")
      .max(10000, "Time limit cannot exceed 10,000ms")
      .default(4000),
    memoryLimitMb: z
      .number({ message: "Memory limit must be a number" })
      .int()
      .min(16, "Memory limit must be at least 16MB")
      .max(1024, "Memory limit cannot exceed 1024MB")
      .default(256),
    maxScore: z
      .number({ message: "Max score must be a number" })
      .int()
      .positive("Max score must be greater than 0")
      .default(100),
    published: z.boolean().default(false),
    samples: z.array(sampleSchema).min(1, "At least one sample test case is required"),
    tests: z.array(testCaseInputSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.published && data.tests && data.tests.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published problems require at least 5 evaluation test cases",
        path: ["tests"],
      });
    }

    if (data.tests && data.tests.length > 0 && data.samples && data.samples.length > 0) {
      for (const t of data.tests) {
        const tInput = t.input.trim();
        const tExpected = t.expected.trim();
        for (const s of data.samples) {
          if (tInput === s.input.trim() && tExpected === s.output.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Evaluation test case cannot be identical to sample case ${s.ordinal ?? ""}`,
              path: ["tests"],
            });
          }
        }
      }
    }

    if (data.tests && data.tests.length > 0) {
      const hasCustomPoints = data.tests.some((t) => t.points > 0);
      if (hasCustomPoints) {
        const totalPoints = data.tests.reduce((acc, t) => acc + t.points, 0);
        if (totalPoints !== data.maxScore) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Evaluation test points sum (${totalPoints}) must match problem max score (${data.maxScore})`,
            path: ["tests"],
          });
        }
      }
    }
  });

export const replaceTestsSchema = z.object({
  tests: z.array(testCaseInputSchema).min(1, "At least one testcase is required"),
});

export type ValidatedProblemInput = z.infer<typeof problemInputSchema>;
export type ValidatedSample = z.infer<typeof sampleSchema>;
export type ValidatedTestCaseInput = z.infer<typeof testCaseInputSchema>;
