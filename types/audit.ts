import type { PageInfo } from "@/types/resource";

export type AuditChange = {
  field: string;
  operation: "add" | "update" | "remove";
  before?: unknown;
  after?: unknown;
};

export type AuditEvent = {
  id: number;
  actorUserId: number | null;
  actor?: {
    kind: "user" | "machine";
    displayName: string;
  } | null;
  targetResourceId: number | null;
  eventType: string;
  result: string;
  changes?: AuditChange[];
  createdAt: string;
};

export type AuditEventListParams = {
  targetResourceId?: number;
  environmentId?: number;
  environmentSlug?: string;
  eventType?: string | string[];
  result?: string | string[];
  q?: string;
  page?: number;
  pageSize?: number;
};

export type AuditEventListResponse = {
  items: AuditEvent[];
  pageInfo: PageInfo;
};
