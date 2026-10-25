export type QueryWorkspaceWorksheet = {
  readonly id: string;
  readonly name: string;
  readonly targetResourceId: number;
  readonly statement: string;
  readonly activeDatabase: string | null;
  /** Persisted PostgreSQL namespace pin; absent on legacy documents. */
  readonly activeSchema?: string | null;
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
