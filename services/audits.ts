import { apiClient } from "@/services/api-client";
import type { AuditEvent, AuditEventListResponse } from "@/types/audit";

export async function listAuditEvents(): Promise<AuditEvent[]> {
  const response = await apiClient<AuditEventListResponse>("/audit-events");

  return [...response.items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function listResourceAuditEvents(
  resourceId: string,
): Promise<AuditEvent[]> {
  const response = await apiClient<AuditEventListResponse>(
    `/resources/${encodeURIComponent(resourceId)}/audit-events`,
  );

  return [...response.items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function listRecentAuditEvents(limit = 5): Promise<AuditEvent[]> {
  const events = await listAuditEvents();

  return events.slice(0, limit);
}
