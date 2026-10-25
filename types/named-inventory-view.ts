export type NamedInventoryViewScope = "personal" | "shared";

export type NamedInventoryViewFilters = {
  q?: string;
  resourceType?: string[];
  resourceSubtype?: string[];
  environmentId?: number[];
  lifecycleStatus?: string[];
  healthStatus?: string[];
  ownerId?: number;
  label?: string[];
  includeArchived?: boolean;
  archivedOnly?: boolean;
};

export type NamedInventoryViewSort = {
  field: string;
  direction: "asc" | "desc";
};

export type NamedInventoryViewState = {
  filters: NamedInventoryViewFilters;
  sort: NamedInventoryViewSort;
  columns: string[];
};

export type NamedInventoryView = {
  id: number;
  name: string;
  scope: NamedInventoryViewScope;
  state: NamedInventoryViewState;
  createdAt: string;
  updatedAt: string;
};

export type NamedInventoryViewListResponse = {
  items: NamedInventoryView[];
  canManageShared: boolean;
};

export type CreateNamedInventoryViewInput = {
  name: string;
  scope: NamedInventoryViewScope;
  state: NamedInventoryViewState;
};

export type UpdateNamedInventoryViewInput = Omit<CreateNamedInventoryViewInput, "scope">;
