export type Environment = {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
};

export type EnvironmentListResponse = {
  items: Environment[];
};

export type Owner = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type OwnerListResponse = {
  items: Owner[];
};

export type Role = {
  id: string;
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
