import { z } from "zod";

export const proctorAccessSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  webWithAgent: z.boolean(),
  webOnly: z.boolean(),
  reason: z.string().max(500, "Reason must be 500 characters or less").default(""),
  hoursValid: z.number().int().min(0).max(72).default(0),
});

export const revokeAgentSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required"),
  reason: z.string().min(1, "Revocation reason is required").max(500, "Reason must be 500 characters or less"),
});

export const toggleProctorExemptionSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  exempt: z.boolean(),
  reason: z.string().max(500, "Reason must be 500 characters or less").optional(),
});

export const proctorUserQuerySchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export type ValidatedProctorAccess = z.infer<typeof proctorAccessSchema>;
export type ValidatedRevokeAgent = z.infer<typeof revokeAgentSchema>;
export type ValidatedToggleProctorExemption = z.infer<typeof toggleProctorExemptionSchema>;
export type ValidatedProctorUserQuery = z.infer<typeof proctorUserQuerySchema>;
