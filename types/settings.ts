export type Environment = {
  id: number;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
};

export type EnvironmentListResponse = {
  items: Environment[];
};

export type Owner = {
  id: number;
  name: string;
  email: string;
  createdAt: string;
};

export type OwnerListResponse = {
  items: Owner[];
};

export type Role = {
  id: number;
  name: string;
  description: string;
  createdAt: string;
};

export type RoleListResponse = {
  items: Role[];
};

export type DictionaryRecord = {
  key: string;
  description: string;
  values: string[];
};

export type ResourceTypeDefinition = {
  key: string;
  label: string;
  description: string;
};

export type ResourceTypeListResponse = {
  items: ResourceTypeDefinition[];
};

export type RelationTypeDefinition = {
  key: string;
  label: string;
  description: string;
};

export type RelationTypeListResponse = {
  items: RelationTypeDefinition[];
};

export type DictionaryItem = {
  key: string;
  label: string;
  description: string;
};

export type DictionaryItemListResponse = {
  items: DictionaryItem[];
};
