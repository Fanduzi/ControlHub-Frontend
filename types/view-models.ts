import type { AuditEvent } from "@/types/audit";
import type { Resource, ResourceRelation } from "@/types/resource";

export type AuditEventViewModel = AuditEvent & {
  actorLabel: string;
  targetResourceName: string;
  environmentLabel: string;
  summary: string;
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
};

export type ResourceDetailViewModel = ResourceListViewModel & {
  profile: Record<string, string>;
  relations: ResourceRelationViewModel[];
  auditEvents: AuditEventViewModel[];
};
