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
};

export type PageInfo = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type ResourceListParams = {
  resourceType?: string;
  environmentId?: string;
  lifecycleStatus?: string;
  healthStatus?: string;
  q?: string;
  page?: number;
  pageSize?: number;
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
