export type AuditLogEntry = {
  id: string;
  actorId?: string;
  actorUsername: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string;
  status: "success" | "failure" | "blocked" | "locked" | string;
  ipAddress: string;
  userAgent: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type AuditLogFilter = {
  action?: string;
  status?: string;
  actorUsername?: string;
  targetType?: string;
  limit?: number;
  offset?: number;
};

export type AuditLogsResponse = {
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
};
