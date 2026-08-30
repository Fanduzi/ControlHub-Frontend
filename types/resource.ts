// input: backend resource, profile, relation, topology, health, effective-value, identity, override, rule, and bulk-mutation JSON contracts
// output: governed resource identity, server-derived completeness, health/provenance, override, server-owned relationship-rule, and closed atomic bulk-mutation transport types
// pos: shared TypeScript transport boundary between resource services and UI
// note: if this file changes, update this header and types/README.md.
export type ResourceType =
  | "host"
  | "database_instance"
  | "database_cluster"
  | "service"
  | "domain_name"
  | "virtual_ip"
  | "database_proxy"
  | "control_plane_component";

export type ResourceOrigin = "manual" | "imported" | "discovered";

export type ResourceExternalIdentifier = {
  system: string;
  value: string;
};

export type ProfileSummary = {
  hostname?: string;
  ip?: string;
  port?: number;
  nodeCount?: number;
  engine?: string;
  version?: string;
  role?: string;
};

export type DatabaseOperationalSummary = {
  memberCount: number;
  criticalMemberCount: number;
  warningMemberCount: number;
  stoppedMemberCount: number;
  degradedMemberCount: number;
  unknownRoleCount: number;
  primaryMemberCount: number;
  replicaMemberCount: number;
  worstMemberId?: number;
  worstMemberName?: string;
  worstMemberStatus?: string;
};

export type HealthFreshness = "fresh" | "stale" | "never";

export type ResourceCompleteness = {
  score: number;
  status: "complete" | "partial";
  missingRequirements: string[];
};

export type Resource = {
  id: number;
  resourceType: ResourceType;
  resourceSubtype: string;
  name: string;
  displayName: string;
  environmentId: number;
  ownerId: number;
  lifecycleStatus: string;
  healthStatus: string;
  healthFreshness?: HealthFreshness;
  healthObservedAt?: string | null;
  healthObserver?: string;
  manualHealthOverride?: string | null;
  origin?: ResourceOrigin;
  aliases?: string[];
  externalIdentifiers?: ResourceExternalIdentifier[];
  source?: string;
  externalId?: string;
  labels: Record<string, string>;
  completeness?: ResourceCompleteness;
  profileSummary?: ProfileSummary | null;
  clusterId?: number | null;
  databaseOperationalSummary?: DatabaseOperationalSummary | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: number | null;
  archiveReason: string | null;
};

export type PageInfo = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type ResourceListParams = {
  resourceType?: string | string[];
  resourceSubtype?: string | string[];
  environmentId?: number | number[];
  environmentSlug?: string;
  lifecycleStatus?: string | string[];
  healthStatus?: string | string[];
  ownerId?: number;
  label?: string | string[];
  q?: string;
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
  archivedOnly?: boolean;
};

export type ResourceListResponse = {
  items: Resource[];
  pageInfo: PageInfo;
};

export type ResourceProfileValue = string | number | boolean | null;

export type ResourceProfileResponse = {
  resourceId: number;
  resourceType: ResourceType;
  resourceSubtype: string;
  profile: Record<string, ResourceProfileValue>;
};

export type EffectiveValue = {
  value: ResourceProfileValue;
  provenance: {
    kind: "observed" | "manual_override";
    source?: string;
    version?: number;
  };
};

export type EffectiveValuesResponse = {
  values: Record<string, EffectiveValue>;
};

export type ResourceOverrideField =
  | "displayName"
  | "lifecycleStatus"
  | "healthStatus";

export type OverrideVersionResponse = {
  version: number;
};

export type RelatedResourceSummary = {
  id: number;
  displayName: string;
  resourceType: ResourceType;
  resourceSubtype?: string;
  healthStatus: string;
};

export type ResourceRelation = {
  id: number;
  fromResourceId: number;
  toResourceId: number;
  relationType: string;
  createdAt: string;
  relatedResource?: RelatedResourceSummary | null;
};

export type ResourceRelationListResponse = {
  items: ResourceRelation[];
};

export type RelationshipRule = {
  relationType: string;
  targetResourceTypes: ResourceType[];
  sameEnvironment: boolean;
};

export type RelationshipRulesResponse = {
  sourceResourceId: number;
  sourceEnvironmentId: number;
  rules: RelationshipRule[];
};

export type CreateResourceInput = {
  resourceType: string;
  resourceSubtype?: string;
  name: string;
  displayName: string;
  environmentId: number;
  ownerId: number;
  lifecycleStatus: string;
  healthStatus: string;
  origin: ResourceOrigin;
  aliases?: string[];
  externalIdentifiers?: ResourceExternalIdentifier[];
  source?: string;
  externalId?: string;
  labels?: Record<string, string>;
  profile?: Record<string, string | number | boolean>;
  completeness?: never;
};

export type UpdateResourceInput = {
  name?: string;
  resourceSubtype?: string;
  displayName?: string;
  environmentId?: number;
  ownerId?: number;
  lifecycleStatus?: string;
  healthStatus?: string | null;
  aliases?: string[];
  externalIdentifiers?: ResourceExternalIdentifier[];
  externalId?: string;
  labels?: Record<string, string>;
  completeness?: never;
};

export type BulkResourceMutationRequest = {
  targets: Array<{ resourceId: number; expectedVersion: string }>;
  fieldPatch?: {
    environmentId?: number;
    ownerId?: number;
    lifecycleStatus?: "provisioning" | "running" | "stopped" | "degraded" | "decommissioning";
  };
  labels?: {
    add?: Record<string, string>;
    update?: Record<string, string>;
    remove?: string[];
  };
};

export type BulkResourceMutationPreview = {
  items: Array<{
    resourceId: number;
    conflict: boolean;
    fieldDiffs?: Array<{ field: string; before: unknown; after: unknown }>;
    labelDiffs?: Array<{ key: string; before?: string | null; after?: string | null }>;
    errors?: string[];
  }>;
  fingerprint: string;
  confirmable: boolean;
};

export type CreateResourceRelationInput = {
  toResourceId: number;
  relationType: string;
};

// Topology types — matches backend Phase 12.6 contract

export type TopologyRole =
  | "application"
  | "entry"
  | "proxy_active"
  | "proxy_standby"
  | "cluster"
  | "primary"
  | "replica"
  | "replica_intermediate"
  | "host"
  | "control_plane"
  | "service"
  | "generic";

export type TopologyLayer =
  | "application"
  | "entry"
  | "cluster"
  | "replication"
  | "control_plane"
  | "host"
  | "generic";

export type EdgeSemanticType =
  | "traffic"
  | "failover"
  | "replication"
  | "membership"
  | "placement"
  | "management"
  | "dependency"
  | "monitoring";

export type TopologyNode = {
  id: number;
  resourceType: string;
  resourceSubtype: string;
  name: string;
  displayName: string;
  environmentId: number;
  ownerId: number;
  lifecycleStatus: string;
  healthStatus: string;
  isRoot: boolean;
  distance: number;
  topologyRole: TopologyRole;
  topologyLayer: TopologyLayer;
  groupKey: string;
  visualImportance: number;
  isDatabaseTopology: boolean;
  replicationDepth: number;
  replicationParentId?: number;
  hostname?: string;
  ip?: string;
  port?: number;
  problems?: TopologyProblem[];
  labels?: Record<string, string>;
};

export type TopologyEdge = {
  id: number;
  fromResourceId: number;
  toResourceId: number;
  relationType: string;
  semanticType: EdgeSemanticType;
};

export type TopologyGroup = {
  id: number;
  label: string;
  resourceType: string;
  nodeIds: number[];
};

export type TopologyResponse = {
  rootResourceId: number;
  depth: number;
  direction: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  groups: TopologyGroup[];
  isDatabaseTopology: boolean;
  problems?: TopologyProblemSummary[];
  candidates?: TopologyNode[];
  truncated?: boolean;
};

export type TopologyProblem = {
  severity: "warning" | "critical";
  message: string;
  code: string;
};

export type TopologyProblemSummary = {
  resourceId: number;
  resourceName: string;
  resourceType: string;
  severity: "warning" | "critical";
  problems: TopologyProblem[];
};

export type TopologyParams = {
  depth?: 1 | 2;
  direction?: "both" | "upstream" | "downstream";
  relationType?: string;
};

export type EnvironmentTopologyParams = {
  rootResourceId?: number;
  depth?: number;
};

// Cluster member types — matches Backend 17A GET /resources/{id}/members

export type ClusterMember = {
  id: number;
  name: string;
  displayName: string;
  resourceType: ResourceType;
  resourceSubtype: string;
  profileSummary?: ProfileSummary;
  healthStatus: string;
  lifecycleStatus: string;
};

export type ClusterMemberListResponse = {
  members: ClusterMember[];
};

export type ResourceDetailResponse = {
  resource: Resource;
  members?: ClusterMember[];
};
