import type { AuditEvent } from "@/types/audit";
import type {
  ClusterMember,
  DatabaseOperationalSummary,
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
  relatedResourceId: number;
  relatedResourceName: string;
  direction: "incoming" | "outgoing";
  relatedResource?: ResourceRelation["relatedResource"];
};

export type ResourceListViewModel = Resource & {
  environmentName: string;
  ownerName: string;
  summary: string;
  isArchived: boolean;
  databaseOperationalSummary?: DatabaseOperationalSummary | null;
};

export type ResourceListViewModelResponse = {
  items: ResourceListViewModel[];
  pageInfo: PageInfo;
};

export type ResourceDetailViewModel = ResourceListViewModel & {
  profile: Record<string, string>;
  relations: ResourceRelationViewModel[];
  auditEvents: AuditEventViewModel[];
  recentAudits?: AuditEventViewModel[];
  members?: ClusterMember[];
  clusterInfo?: {
    id: number;
    displayName: string;
    healthStatus: string;
    lifecycleStatus: string;
  };
};
