import { z } from "zod";
import { CONTEST_STATUS } from "@/types/contest";

export const contestStatusSchema = z.enum([
  CONTEST_STATUS.NOT_STARTED,
  CONTEST_STATUS.RUNNING,
  CONTEST_STATUS.PAUSED,
  CONTEST_STATUS.ENDED,
]);

export const contestStateSchema = z.object({
  title: z.string().default("MiniAlgothon 2026"),
  status: contestStatusSchema.default(CONTEST_STATUS.NOT_STARTED),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  durationSeconds: z.coerce.number().int().nonnegative().default(7200),
  freezeMinutes: z.coerce.number().int().nonnegative().default(30),
  pausedAt: z.string().nullable().optional(),
  remainingSeconds: z.coerce.number().int().nonnegative().default(0),
  elapsedSeconds: z.coerce.number().int().nonnegative().default(0),
  isFrozen: z.boolean().default(false),
  serverTime: z.string().default(() => new Date().toISOString()),
});

export type ValidatedContestState = z.infer<typeof contestStateSchema>;
