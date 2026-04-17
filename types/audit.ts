import type { PageInfo } from "@/types/resource";

export type AuditEvent = {
  id: string;
  actorUserId: string;
  targetResourceId: string;
  eventType: string;
  result: string;
  createdAt: string;
};

export type AuditEventListParams = {
  targetResourceId?: string;
  eventType?: string | string[];
  result?: string | string[];
  page?: number;
  pageSize?: number;
};

export type AuditEventListResponse = {
  items: AuditEvent[];
  pageInfo: PageInfo;
};
