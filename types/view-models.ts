import type { AuditEvent } from "@/types/audit";
import type { PageInfo, Resource, ResourceRelation } from "@/types/resource";

export type AuditEventViewModel = AuditEvent & {
  actorLabel: string;
  targetResourceName: string;
  environmentLabel: string;
  summary: string;
};

export type AuditEventViewModelListResponse = {
  items: AuditEventViewModel[];
  pageInfo: PageInfo;
};

export type ResourceRelationViewModel = ResourceRelation & {
  relatedResourceId: string;
  relatedResourceName: string;
  direction: "incoming" | "outgoing";
};

export type ResourceListViewModel = Resource & {
  environmentName: string;
  ownerName: string;
  summary: string;
  isArchived: boolean;
};

export type ResourceListViewModelResponse = {
  items: ResourceListViewModel[];
  pageInfo: PageInfo;
};

export type ResourceDetailViewModel = ResourceListViewModel & {
  profile: Record<string, string>;
  relations: ResourceRelationViewModel[];
  auditEvents: AuditEventViewModel[];
};
