import { z } from "zod";

export const startContestSchema = z.object({
  durationMinutes: z
    .number({ message: "Duration must be a number" })
    .int()
    .min(0, "Duration cannot be negative")
    .max(1440, "Duration cannot exceed 24 hours")
    .optional(),
});

export const extendContestSchema = z.object({
  minutes: z
    .number({ message: "Minutes must be a number" })
    .int()
    .min(1, "Must extend by at least 1 minute")
    .max(720, "Cannot extend by more than 12 hours"),
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
      .min(5, "Contest duration must be at least 5 minutes")
      .max(1440, "Contest duration cannot exceed 24 hours"),
    freezeMinutes: z
      .number({ message: "Freeze minutes must be a number" })
      .int()
      .min(0, "Freeze minutes cannot be negative")
      .max(360, "Freeze window cannot exceed 6 hours"),
  })
  .refine((data) => data.freezeMinutes <= data.durationMinutes, {
    message: "Freeze window cannot be longer than total contest duration",
    path: ["freezeMinutes"],
  });

export type ValidatedStartContest = z.infer<typeof startContestSchema>;
export type ValidatedExtendContest = z.infer<typeof extendContestSchema>;
export type ValidatedContestSettings = z.infer<typeof updateContestSettingsSchema>;
