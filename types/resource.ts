export type ResourceType =
  | "host"
  | "database_instance"
  | "database_cluster"
  | "service";

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

export type ResourceListResponse = {
  items: Resource[];
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
