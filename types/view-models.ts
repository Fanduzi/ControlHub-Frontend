import type { AuditEvent } from "@/types/audit";
import type {
  ClusterMember,
  PageInfo,
  Resource,
  ResourceRelation,
} from "@/types/resource";

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
  relatedResource?: ResourceRelation["relatedResource"];
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
  members?: ClusterMember[];
};
