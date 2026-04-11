import type { AuditEvent, AuditEventListResponse } from "@/types/audit";

const auditEventsResponse: AuditEventListResponse = {
  items: [
    {
      id: "audit-1",
      actorUserId: "user-admin",
      targetResourceId: "res-db-primary",
      eventType: "resource.updated",
      result: "success",
      createdAt: "2026-04-11T21:00:00Z",
    },
    {
      id: "audit-2",
      actorUserId: "user-editor",
      targetResourceId: "res-db-cluster-orders",
      eventType: "relation.created",
      result: "success",
      createdAt: "2026-04-11T21:05:00Z",
    },
    {
      id: "audit-3",
      actorUserId: "user-admin",
      targetResourceId: "res-service-checkout",
      eventType: "owner.updated",
      result: "success",
      createdAt: "2026-04-11T21:12:00Z",
    },
    {
      id: "audit-4",
      actorUserId: "user-editor",
      targetResourceId: "res-service-inventory",
      eventType: "resource.created",
      result: "success",
      createdAt: "2026-04-11T20:40:00Z",
    },
    {
      id: "audit-5",
      actorUserId: "user-admin",
      targetResourceId: "res-host-bastion",
      eventType: "resource.updated",
      result: "success",
      createdAt: "2026-04-11T19:50:00Z",
    },
  ],
};

export async function listAuditEvents(): Promise<AuditEvent[]> {
  return [...auditEventsResponse.items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function listResourceAuditEvents(
  resourceId: string,
): Promise<AuditEvent[]> {
  const response: AuditEventListResponse = {
    items: auditEventsResponse.items.filter(
      (event) => event.targetResourceId === resourceId,
    ),
  };

  return [...response.items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function listRecentAuditEvents(limit = 5): Promise<AuditEvent[]> {
  const events = await listAuditEvents();

  return events.slice(0, limit);
}
