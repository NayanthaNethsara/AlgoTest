export type UserRole = "competitor" | "admin";

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt?: string;
  teamId?: string;
  teamName?: string;
};

export type CreateUserInput = {
  username: string;
  displayName?: string;
  role?: string;
  password?: string;
};

export type BulkResult = {
  username: string;
  status: "created" | "error";
  error?: string;
  password?: string;
};
