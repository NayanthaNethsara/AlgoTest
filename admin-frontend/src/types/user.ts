import type { SessionUser, UserRole } from "@mini-algothon/auth";

export type { UserRole };
export type User = SessionUser;

export type CreateUserInput = {
  username: string;
  displayName?: string;
  password?: string;
  teamId?: string;
  teamName?: string;
};

export type BulkResult = {
  username: string;
  status: "created" | "error";
  error?: string;
  password?: string;
  teamName?: string;
  user?: User;
};
