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
  proctorAllowWebOnly?: boolean;
  proctorAccessReason?: string;
  isSuspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: string;
}

/** How a submission reached the server — see the backend's agent.AccessMode. */
export type AccessMode = "DESKTOP" | "WEB_WITH_AGENT" | "WEB_ONLY";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthActionResult {
  success: boolean;
  error?: string;
  user?: SessionUser;
}
