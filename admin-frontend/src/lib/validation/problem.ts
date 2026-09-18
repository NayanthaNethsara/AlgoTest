import { z } from "zod";
import { MAX_SINGLE_TEST_FILE_BYTES } from "@/lib/testcase-utils";

export const sampleSchema = z.object({
  id: z.string().optional(),
  ordinal: z.number().int().positive().optional(),
  input: z
    .string()
    .min(1, "Sample input is required")
    .max(1_000_000, "Sample input cannot exceed 1 MB"),
  output: z
    .string()
    .min(1, "Sample output is required")
    .max(1_000_000, "Sample output cannot exceed 1 MB"),
  explanation: z
    .string()
    .max(5_000, "Explanation cannot exceed 5,000 characters")
    .optional(),
});

export const testCaseInputSchema = z.object({
  ordinal: z.number().int().positive().optional(),
  input: z
    .string()
    .min(1, "Test input is required")
    .max(MAX_SINGLE_TEST_FILE_BYTES, "Test input cannot exceed 20 MB"),
  expected: z
    .string()
    .min(1, "Expected output is required")
    .max(MAX_SINGLE_TEST_FILE_BYTES, "Expected output cannot exceed 20 MB"),
  points: z
    .number({ message: "Points must be a number" })
    .int("Points must be an integer")
    .nonnegative("Points must be 0 or positive")
    .max(10_000, "Points cannot exceed 10,000"),
});

export const updatePointsMapSchema = z.record(
  z.string().regex(/^\d+$/, "Key must be numeric test ordinal"),
  z
    .number({ message: "Points must be a number" })
    .int("Points must be an integer")
    .nonnegative("Points must be 0 or positive")
    .max(10_000, "Points cannot exceed 10,000")
);

export const problemInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Slug is required")
      .max(64, "Slug cannot exceed 64 characters")
      .regex(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
        "Slug must be lowercase alphanumeric and hyphens only (e.g. 'two-sum')"
      ),
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(120, "Title must be 120 characters or less"),
    difficulty: z.enum(["Easy", "Medium", "Hard"], {
      error: "Difficulty must be Easy, Medium, or Hard",
    }),
    statement: z
      .string()
      .trim()
      .min(1, "Problem statement is required")
      .max(500_000, "Problem statement cannot exceed 500,000 characters"),
    constraints: z
      .string()
      .max(50_000, "Constraints cannot exceed 50,000 characters")
      .default(""),
    timeLimitMs: z
      .number({ message: "Time limit must be a number" })
      .int("Time limit must be an integer")
      .min(100, "Time limit must be at least 100ms")
      .max(10_000, "Time limit cannot exceed 10,000ms")
      .default(4000),
    memoryLimitMb: z
      .number({ message: "Memory limit must be a number" })
      .int("Memory limit must be an integer")
      .min(16, "Memory limit must be at least 16MB")
      .max(1024, "Memory limit cannot exceed 1024MB")
      .default(256),
    maxScore: z
      .number({ message: "Max score must be a number" })
      .int("Max score must be an integer")
      .min(1, "Max score must be at least 1")
      .max(10_000, "Max score cannot exceed 10,000")
      .default(100),
    published: z.boolean().default(false),
    samples: z
      .array(sampleSchema)
      .min(1, "At least one sample test case is required")
      .max(20, "Cannot exceed 20 sample cases"),
    tests: z
      .array(testCaseInputSchema)
      .max(500, "Cannot exceed 500 evaluation test cases")
      .optional(),
  })
  .superRefine((data, ctx) => {
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
  tests: z
    .array(testCaseInputSchema)
    .min(1, "At least one testcase is required")
    .max(500, "Cannot exceed 500 test cases per batch"),
});

export type ValidatedProblemInput = z.infer<typeof problemInputSchema>;
export type ValidatedSample = z.infer<typeof sampleSchema>;
export type ValidatedTestCaseInput = z.infer<typeof testCaseInputSchema>;
export type ValidatedUpdatePointsMap = z.infer<typeof updatePointsMapSchema>;
