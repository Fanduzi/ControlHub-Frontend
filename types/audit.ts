import type { PageInfo } from "@/types/resource";

export type AuditEvent = {
  id: number;
  actorUserId: number | null;
  targetResourceId: number | null;
  eventType: string;
  result: string;
  createdAt: string;
};

export type AuditEventListParams = {
  targetResourceId?: number;
  eventType?: string | string[];
  result?: string | string[];
  page?: number;
  pageSize?: number;
};

export type AuditEventListResponse = {
  items: AuditEvent[];
  pageInfo: PageInfo;
};
