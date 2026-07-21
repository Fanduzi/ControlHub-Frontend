import { apiClient } from "@/services/api-client";
import type {
  DatabaseListResponse,
  ObjectDetailResponse,
  ObjectListResponse,
  RelationshipMapParams,
  RelationshipMapResponse,
  SchemaDatabaseListParams,
  SchemaObjectDetailParams,
  SchemaObjectListParams,
  TableDefinitionParams,
  TableDefinitionResponse,
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
  const raw = await apiClient<ObjectDetailResponse>(path, { signal: params.signal });
  return normalizeObjectDetail(raw);
}

/**
 * Fetch the CREATE TABLE definition for a specific table.
 *
 * @param targetId - The query target resource ID
 * @param params - Required database and name, optional abort signal
 */
export async function getTableDefinition(
  targetId: number,
  params: TableDefinitionParams,
): Promise<TableDefinitionResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("database", params.database);
  searchParams.set("name", params.name);

  return apiClient<TableDefinitionResponse>(
    `/query-targets/${targetId}/schema/table-definition?${searchParams.toString()}`,
    { signal: params.signal },
  );
}

/**
 * Fetch the foreign-key relationship map for a specific schema object.
 *
 * @param targetId - The query target resource ID
 * @param params - Required database and name, optional refresh and abort signal
 */
export async function getRelationshipMap(
  targetId: number,
  params: RelationshipMapParams,
): Promise<RelationshipMapResponse> {
  const path = buildRelationshipMapPath(targetId, params);
  return apiClient<RelationshipMapResponse>(path, { signal: params.signal });
}

/** Coerce wire null/undefined collections to empty arrays for safe rendering. */
export function normalizeObjectDetail(
  raw: ObjectDetailResponse | (Omit<ObjectDetailResponse, "columns" | "indexes" | "foreignKeys"> & {
    columns?: ObjectDetailResponse["columns"] | null;
    indexes?: ObjectDetailResponse["indexes"] | null;
    foreignKeys?: ObjectDetailResponse["foreignKeys"] | null;
  }),
): ObjectDetailResponse {
  const columns = raw.columns ?? [];
  const indexes = (raw.indexes ?? []).map((index) => ({
    ...index,
    columns: index.columns ?? [],
  }));
  const foreignKeys = (raw.foreignKeys ?? []).map((fk) => ({
    ...fk,
    columns: fk.columns ?? [],
    referencedColumns: fk.referencedColumns ?? [],
  }));
  return {
    ...raw,
    columns,
    indexes,
    foreignKeys,
  };
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

function buildRelationshipMapPath(
  targetId: number,
  params: RelationshipMapParams,
): string {
  const searchParams = new URLSearchParams({
    database: params.database,
    name: params.name,
  });
  if (params.refresh) searchParams.set("refresh", "true");
  return `/query-targets/${targetId}/schema/relationship-map?${searchParams.toString()}`;
}
