export type AuditEvent = {
  id: string;
  actorUserId: string;
  targetResourceId: string;
  eventType: string;
  result: string;
  createdAt: string;
};

export type AuditEventListResponse = {
  items: AuditEvent[];
};
