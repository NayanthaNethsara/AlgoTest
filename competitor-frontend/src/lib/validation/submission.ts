import { z } from "zod";

export const runCodeInputSchema = z.object({
  language: z.string().trim().min(1, "Language is required"),
  code: z
    .string()
    .min(1, "Code cannot be empty")
    .max(100_000, "Code exceeds maximum limit (100KB)"),
  stdin: z
    .string()
    .max(1_000_000, "Input exceeds maximum limit (1MB)")
    .optional()
    .default(""),
});

export const submitCodeInputSchema = z.object({
  problemId: z.string().trim().min(1, "Problem ID is required"),
  language: z.string().trim().min(1, "Language is required"),
  code: z
    .string()
    .min(1, "Code cannot be empty")
    .max(100_000, "Code exceeds maximum limit (100KB)"),
  previousBest: z.number().int().min(0).optional().default(0),
  attestNonce: z.string().nullable().optional(),
});

export type ValidatedRunCodeInput = z.infer<typeof runCodeInputSchema>;
export type ValidatedSubmitCodeInput = z.infer<typeof submitCodeInputSchema>;
