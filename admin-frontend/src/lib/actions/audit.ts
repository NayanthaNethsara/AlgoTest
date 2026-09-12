"use server";

import { backendFetch } from "@/lib/api/server";
import type { AuditLogFilter, AuditLogsResponse } from "@/types/audit";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function getAuditLogsAction(filter: AuditLogFilter = {}): Promise<AuditLogsResponse> {
  const queryParams = new URLSearchParams();

  if (filter.limit !== undefined) {
    queryParams.set("limit", String(filter.limit));
  }
  if (filter.offset !== undefined) {
    queryParams.set("offset", String(filter.offset));
  }
  if (filter.action) {
    queryParams.set("action", filter.action);
  }
  if (filter.status) {
    queryParams.set("status", filter.status);
  }
  if (filter.actorUsername) {
    queryParams.set("actorUsername", filter.actorUsername);
  }
  if (filter.targetType) {
    queryParams.set("targetType", filter.targetType);
  }

  const query = queryParams.toString();
  const endpoint = `/api/v1/admin/audit-logs${query ? `?${query}` : ""}`;

  try {
    const res = await backendFetch(endpoint);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to fetch audit logs");
    }
    const data = await res.json();
    return {
      logs: data.logs || [],
      total: data.total || 0,
      limit: data.limit || 50,
      offset: data.offset || 0,
    };
  } catch (err: unknown) {
    throw new Error(getErrorMessage(err, "Failed to fetch audit logs"));
  }
}
