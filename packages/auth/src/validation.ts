import { z } from "zod";

export const loginCredentialsSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.confirmPassword !== undefined) {
        return data.newPassword === data.confirmPassword;
      }
      return true;
    },
    {
      message: "New passwords do not match",
      path: ["confirmPassword"],
    }
  );

export type ValidatedLoginCredentials = z.infer<typeof loginCredentialsSchema>;
export type ValidatedChangePassword = z.infer<typeof changePasswordSchema>;
