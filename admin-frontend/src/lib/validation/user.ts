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
    .optional()
    .or(z.literal("")),
  role: z.enum(["competitor", "admin"]).default("competitor"),
  teamId: z.string().optional().or(z.literal("")),
  teamName: z.string().trim().max(100).optional().or(z.literal("")),
});

export const bulkCreateUsersSchema = z.object({
  users: z.array(createUserInputSchema).min(1, "At least one user is required"),
  defaultTeamId: z.string().optional(),
  defaultTeamName: z.string().optional(),
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
