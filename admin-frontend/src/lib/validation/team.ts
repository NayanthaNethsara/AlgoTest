import { z } from "zod";

export const teamMemberInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be 50 characters or less"),
  displayName: z.string().trim().max(100, "Display name must be 100 characters or less").optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional()
    .or(z.literal("")),
});

export const createTeamInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Team name is required")
    .max(100, "Team name must be 100 characters or less"),
  members: z
    .array(teamMemberInputSchema)
    .max(3, "A team can have at most 3 members")
    .optional(),
});

export const updateTeamInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Team name is required")
    .max(100, "Team name must be 100 characters or less"),
});

export const addTeamMemberPayloadSchema = z.union([
  z.object({
    userId: z.string().min(1, "User ID is required"),
  }),
  teamMemberInputSchema,
]);

export type ValidatedCreateTeamInput = z.infer<typeof createTeamInputSchema>;
export type ValidatedUpdateTeamInput = z.infer<typeof updateTeamInputSchema>;
export type ValidatedTeamMemberInput = z.infer<typeof teamMemberInputSchema>;
