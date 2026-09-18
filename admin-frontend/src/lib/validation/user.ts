import { z } from "zod";

export const createUserInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be 50 characters or less"),
  displayName: z.string().trim().max(100, "Display name must be 100 characters or less").optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or less")
    .optional()
    .or(z.literal("")),
  role: z.enum(["competitor", "admin"]).default("competitor"),
  teamId: z.string().max(100, "Team ID too long").optional().or(z.literal("")),
  teamName: z.string().trim().max(100, "Team name must be 100 characters or less").optional().or(z.literal("")),
});

export const bulkCreateUsersSchema = z.object({
  users: z
    .array(createUserInputSchema)
    .min(1, "At least one user is required")
    .max(1000, "Cannot create more than 1,000 users in a single batch"),
  defaultTeamId: z.string().max(100).optional(),
  defaultTeamName: z.string().max(100).optional(),
});

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().max(255, "Suspension reason must be 255 characters or less").optional(),
});

export const updateRoleSchema = z.object({
  role: z.enum(["competitor", "admin"], {
    error: "Role must be 'competitor' or 'admin'",
  }),
});

export type ValidatedCreateUserInput = z.infer<typeof createUserInputSchema>;
export type ValidatedSuspendUser = z.infer<typeof suspendUserSchema>;
export type ValidatedUpdateRole = z.infer<typeof updateRoleSchema>;
