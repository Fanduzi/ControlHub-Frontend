export type ResourceType =
  | "host"
  | "database_instance"
  | "database_cluster"
  | "service"
  | "domain_name"
  | "virtual_ip"
  | "database_proxy"
  | "control_plane_component";

export type Resource = {
  id: string;
  resourceType: ResourceType;
  resourceSubtype: string;
  name: string;
  displayName: string;
  environmentId: string;
  ownerId: string;
  lifecycleStatus: string;
  healthStatus: string;
  source: string;
  externalId: string;
  labels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
};

export type PageInfo = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type ResourceListParams = {
  resourceType?: string | string[];
  resourceSubtype?: string;
  environmentId?: string;
  environmentSlug?: string;
  lifecycleStatus?: string | string[];
  healthStatus?: string | string[];
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
  resourceId: string;
  resourceType: ResourceType;
  resourceSubtype: string;
  profile: Record<string, ResourceProfileValue>;
};

export type ResourceRelation = {
  id: string;
  fromResourceId: string;
  toResourceId: string;
  relationType: string;
  createdAt: string;
};

export type ResourceRelationListResponse = {
  items: ResourceRelation[];
};

export type CreateResourceInput = {
  resourceType: string;
  resourceSubtype?: string;
  name: string;
  displayName: string;
  environmentId: string;
  ownerId: string;
  lifecycleStatus: string;
  healthStatus: string;
  source: string;
  externalId?: string;
  labels?: Record<string, string>;
};

export type UpdateResourceInput = {
  resourceSubtype?: string;
  displayName?: string;
  environmentId?: string;
  ownerId?: string;
  lifecycleStatus?: string;
  healthStatus?: string;
  source?: string;
  externalId?: string;
  labels?: Record<string, string>;
};

export type CreateResourceRelationInput = {
  toResourceId: string;
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
  id: string;
  resourceType: string;
  resourceSubtype: string;
  name: string;
  displayName: string;
  environmentId: string;
  ownerId: string;
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
  replicationParentId: string;
};

export type TopologyEdge = {
  id: string;
  fromResourceId: string;
  toResourceId: string;
  relationType: string;
  semanticType: EdgeSemanticType;
};

export type TopologyGroup = {
  id: string;
  label: string;
  resourceType: string;
  nodeIds: string[];
};

export type TopologyResponse = {
  rootResourceId: string;
  depth: number;
  direction: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  groups: TopologyGroup[];
  isDatabaseTopology: boolean;
};

export type TopologyParams = {
  depth?: 1 | 2;
  direction?: "both" | "upstream" | "downstream";
  relationType?: string;
};
