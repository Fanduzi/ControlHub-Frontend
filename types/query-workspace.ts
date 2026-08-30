// input: backend QueryWorkspace OpenAPI schemas
// output: owner workspace transport contracts
// pos: type-only boundary for persisted query worksheet drafts
// note: if this file changes, update this header and types/README.md.
export type QueryWorkspaceWorksheet = {
  readonly id: string;
  readonly name: string;
  readonly targetResourceId: number;
  readonly statement: string;
  readonly activeDatabase: string | null;
};

export type QueryWorkspace = {
  readonly worksheets: readonly QueryWorkspaceWorksheet[];
  readonly version: number;
  readonly updatedAt: string;
};

export type QueryWorkspacePutRequest = {
  readonly expectedVersion: number;
  readonly worksheets: readonly QueryWorkspaceWorksheet[];
};
