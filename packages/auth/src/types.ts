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
  /**
   * Which browser fallbacks this account may make scored submissions from. Two
   * independent grants an organizer makes and signs; the desktop client has no flag
   * because it is never withheld.
   */
  proctorAllowWebWithAgent?: boolean;
  proctorAllowWebOnly?: boolean;
  /** Why the grant exists. Present only where a grant is. */
  proctorAccessReason?: string;
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
