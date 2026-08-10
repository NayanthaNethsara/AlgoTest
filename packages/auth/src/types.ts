export type UserRole = "admin" | "competitor";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt?: string;
  teamId?: string;
  teamName?: string;
  proctorExempt?: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthActionResult {
  success: boolean;
  error?: string;
  user?: SessionUser;
}
