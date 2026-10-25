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
  signal?: AbortSignal,
): Promise<QueryWorkspace> {
  const body: QueryWorkspacePutRequest = { expectedVersion, worksheets };
  try {
    return await apiClient<QueryWorkspace>("/query-workspace", {
      method: "PUT",
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw toQueryExecuteError(error);
  }
}
