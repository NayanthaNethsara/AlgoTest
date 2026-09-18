import { z } from "zod";

export const SUPPORTED_LANGUAGES = [
  "c",
  "cpp",
  "c++",
  "py",
  "python",
  "python3",
  "java",
  "js",
  "javascript",
  "node",
  "rust",
  "rs",
] as const;

export const runCodeInputSchema = z.object({
  problemId: z.string().trim().max(100, "Problem ID too long").optional().default(""),
  language: z
    .string()
    .trim()
    .min(1, "Language is required")
    .max(20, "Language identifier too long")
    .refine(
      (val) => (SUPPORTED_LANGUAGES as readonly string[]).includes(val.toLowerCase()),
      { message: "Unsupported programming language" }
    ),
  code: z
    .string()
    .min(1, "Code cannot be empty")
    .max(100_000, "Code exceeds maximum limit (100KB)"),
  stdin: z
    .string()
    .max(1_000_000, "Custom input exceeds maximum limit (1MB)")
    .optional()
    .default(""),
});

export const submitCodeInputSchema = z.object({
  problemId: z
    .string()
    .trim()
    .min(1, "Problem ID is required")
    .max(100, "Problem ID too long"),
  language: z
    .string()
    .trim()
    .min(1, "Language is required")
    .max(20, "Language identifier too long")
    .refine(
      (val) => (SUPPORTED_LANGUAGES as readonly string[]).includes(val.toLowerCase()),
      { message: "Unsupported programming language" }
    ),
  code: z
    .string()
    .min(1, "Code cannot be empty")
    .max(100_000, "Code exceeds maximum limit (100KB)"),
  previousBest: z.number().int().min(0).max(10_000).optional().default(0),
  attestNonce: z.string().max(256, "Attestation nonce too long").nullable().optional(),
  typedCount: z.number().int().min(0).max(1_000_000).optional(),
  pasteCount: z.number().int().min(0).max(100_000).optional(),
  pastedChars: z.number().int().min(0).max(1_000_000).optional(),
  maxPasteSize: z.number().int().min(0).max(1_000_000).optional(),
});

export type ValidatedRunCodeInput = z.infer<typeof runCodeInputSchema>;
export type ValidatedSubmitCodeInput = z.infer<typeof submitCodeInputSchema>;
