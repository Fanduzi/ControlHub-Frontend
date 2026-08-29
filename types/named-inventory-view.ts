// input: named inventory view API JSON contract
// output: named inventory view state with repeated filters, requests, and responses
// pos: frontend transport contract for saved inventory views
// note: if this file changes, update this header and types/README.md.
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
