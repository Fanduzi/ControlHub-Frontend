// input: @/services/api-client, @/services/query-executions, @/types/query-workspace
// output: owner query workspace GET and PUT operations
// pos: narrow transport boundary for server-persisted worksheet drafts
// note: if this file changes, update this header and services/README.md.
import { apiClient } from "@/services/api-client";
import { toQueryExecuteError } from "@/services/query-executions";
import type {
  QueryWorkspace,
  QueryWorkspacePutRequest,
  QueryWorkspaceWorksheet,
} from "@/types/query-workspace";

export async function getQueryWorkspace(): Promise<QueryWorkspace> {
  try {
    return await apiClient<QueryWorkspace>("/query-workspace");
  } catch (error) {
    throw toQueryExecuteError(error);
  }
}

export async function putQueryWorkspace(
  expectedVersion: number,
  worksheets: readonly QueryWorkspaceWorksheet[],
): Promise<QueryWorkspace> {
  const body: QueryWorkspacePutRequest = { expectedVersion, worksheets };
  try {
    return await apiClient<QueryWorkspace>("/query-workspace", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw toQueryExecuteError(error);
  }
}
