// input: named inventory view API JSON contract
// output: named inventory view state, request, and response types
// pos: frontend transport contract for saved inventory views
// note: if this file changes, update this header and README.md
export type NamedInventoryViewScope = "personal" | "shared";

export type NamedInventoryViewFilters = {
  q?: string;
  resourceType?: string;
  resourceSubtype?: string;
  environmentId?: string;
  lifecycleStatus?: string;
  healthStatus?: string;
  ownerId?: string;
  label?: string;
  includeArchived?: string;
  archivedOnly?: string;
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

export type UpdateNamedInventoryViewInput = CreateNamedInventoryViewInput;
