import { apiClient } from "@/services/api-client";
import type {
  DatabaseListResponse,
  ObjectDetailResponse,
  ObjectListResponse,
  SchemaDatabaseListParams,
  SchemaObjectDetailParams,
  SchemaObjectListParams,
} from "@/types/query-schema";

/**
 * Fetch the list of databases for a query target.
 *
 * @param targetId - The query target resource ID
 * @param params - Optional pagination and abort signal
 */
export async function getSchemaDatabases(
  targetId: number,
  params: SchemaDatabaseListParams = {},
): Promise<DatabaseListResponse> {
  const path = buildSchemaDatabasesPath(targetId, params);
  return apiClient<DatabaseListResponse>(path, { signal: params.signal });
}

/**
 * Fetch the list of schema objects (tables/views) for a database.
 *
 * @param targetId - The query target resource ID
 * @param params - Required database, optional filters and abort signal
 */
export async function getSchemaObjects(
  targetId: number,
  params: SchemaObjectListParams,
): Promise<ObjectListResponse> {
  const path = buildSchemaObjectsPath(targetId, params);
  return apiClient<ObjectListResponse>(path, { signal: params.signal });
}

/**
 * Fetch detailed metadata for a specific schema object.
 *
 * @param targetId - The query target resource ID
 * @param params - Required database and name, optional kind and abort signal
 */
export async function getObjectDetails(
  targetId: number,
  params: SchemaObjectDetailParams,
): Promise<ObjectDetailResponse> {
  const path = buildObjectDetailsPath(targetId, params);
  return apiClient<ObjectDetailResponse>(path, { signal: params.signal });
}

function buildSchemaDatabasesPath(
  targetId: number,
  params: SchemaDatabaseListParams,
): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    searchParams.set("pageSize", String(params.pageSize));
  }

  const query = searchParams.toString();
  return query
    ? `/query-targets/${targetId}/schema/databases?${query}`
    : `/query-targets/${targetId}/schema/databases`;
}

function buildSchemaObjectsPath(
  targetId: number,
  params: SchemaObjectListParams,
): string {
  const searchParams = new URLSearchParams();
  searchParams.set("database", params.database);

  if (params.kind) {
    searchParams.set("kind", params.kind);
  }
  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    searchParams.set("pageSize", String(params.pageSize));
  }

  return `/query-targets/${targetId}/schema/objects?${searchParams.toString()}`;
}

function buildObjectDetailsPath(
  targetId: number,
  params: SchemaObjectDetailParams,
): string {
  const searchParams = new URLSearchParams();
  searchParams.set("database", params.database);
  searchParams.set("name", params.name);

  if (params.kind) {
    searchParams.set("kind", params.kind);
  }

  return `/query-targets/${targetId}/schema/object-details?${searchParams.toString()}`;
}
