import { z } from "zod";

export const startContestSchema = z.object({
  durationMinutes: z
    .number({ message: "Duration must be a number" })
    .int()
    .min(0, "Duration cannot be negative")
    .max(525600, "Duration cannot exceed 525,600 minutes (1 year)")
    .optional(),
});

export const extendContestSchema = z.object({
  minutes: z
    .number({ message: "Minutes must be a number" })
    .int()
    .min(1, "Must extend by at least 1 minute")
    .max(43200, "Cannot extend by more than 30 days"),
});

export const updateContestSettingsSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Contest title is required")
      .max(100, "Contest title must be 100 characters or less"),
    durationMinutes: z
      .number({ message: "Duration must be a number" })
      .int()
      .min(1, "Contest duration must be at least 1 minute")
      .max(525600, "Contest duration cannot exceed 525,600 minutes (1 year)"),
    freezeMinutes: z
      .number({ message: "Freeze minutes must be a number" })
      .int()
      .min(0, "Freeze minutes cannot be negative")
      .max(525600, "Freeze window cannot exceed contest duration"),
    requireFullscreen: z.boolean().optional(),
    minClientVersion: z.string().optional(),
    enforceBinaryHash: z.boolean().optional(),
    authorizedBinaryHashes: z.string().optional(),
    downloadEnabled: z.boolean().optional(),
  })
  .refine((data) => data.freezeMinutes <= data.durationMinutes, {
    message: "Freeze window cannot be longer than total contest duration",
    path: ["freezeMinutes"],
  });

export type ValidatedStartContest = z.infer<typeof startContestSchema>;
export type ValidatedExtendContest = z.infer<typeof extendContestSchema>;
export type ValidatedContestSettings = z.infer<typeof updateContestSettingsSchema>;
