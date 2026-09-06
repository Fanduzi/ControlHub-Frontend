// input: @/lib/use-worksheet-schema-adapter, @/lib/schema-catalog
// output: Vitest tests for the React adapter over schema catalog completion
// pos: adapter reads catalog; catalog tests own fetch/TTL
// note: if this file changes, update header and tests/lib/README.md
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COMPLETION_PAGE_SIZE, SchemaCatalog, type SchemaCatalogFetch } from "@/lib/schema-catalog";
import { useWorksheetSchemaAdapter } from "@/lib/use-worksheet-schema-adapter";
import type { ObjectDetailResponse } from "@/types/query-schema";
import type { PageInfo } from "@/types/resource";

function pageInfo(): PageInfo {
  return {
    page: 1,
    pageSize: COMPLETION_PAGE_SIZE,
    totalItems: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function buildDetail(overrides: Partial<ObjectDetailResponse> = {}): ObjectDetailResponse {
  return {
    targetResourceId: 1,
    database: "mydb",
    name: "users",
    kind: "table",
    columns: [
      { name: "id", databaseType: "INT", ordinalPosition: 1, nullable: false, primaryKey: true, autoIncrement: true },
      { name: "email", databaseType: "VARCHAR", ordinalPosition: 2, nullable: false, primaryKey: false, autoIncrement: false },
    ],
    indexes: [],
    foreignKeys: [],
    truncated: { columns: false, indexes: false, foreignKeys: false },
    ...overrides,
  };
}

function createFetch(overrides: Partial<SchemaCatalogFetch> = {}): SchemaCatalogFetch {
  return {
    getDatabases: async () => ({
      defaultDatabase: "mydb",
      items: [{ name: "mydb" }, { name: "other" }],
      pageInfo: pageInfo(),
    }),
    getObjects: async (_targetId, params) => ({
      items: [{ database: params.database, name: "users", kind: "table" as const }],
      pageInfo: pageInfo(),
    }),
    getObjectDetails: async () => buildDetail(),
    ...overrides,
  };
}

describe("useWorksheetSchemaAdapter", () => {
  it("returns undefined when targetId is missing", () => {
    const catalog = new SchemaCatalog(createFetch());
    const { result } = renderHook(() => useWorksheetSchemaAdapter(catalog, undefined, "mydb"));
    expect(result.current.namespace).toBeUndefined();
  });

  it("offers only database-name completion when no database is selected", async () => {
    const catalog = new SchemaCatalog(createFetch());
    await catalog.ensureDatabases(1, { page: 1, pageSize: COMPLETION_PAGE_SIZE });
    const { result } = renderHook(() => useWorksheetSchemaAdapter(catalog, 1, undefined));
    expect(result.current.namespace?.databases).toEqual(["mydb", "other"]);
    expect(result.current.namespace?.tables).toEqual([]);
  });

  it("builds namespace from catalog objects and ready details", async () => {
    const catalog = new SchemaCatalog(createFetch());
    await catalog.ensureDatabases(1, { page: 1, pageSize: COMPLETION_PAGE_SIZE });
    await catalog.ensureObjects(1, "mydb", { page: 1, pageSize: COMPLETION_PAGE_SIZE });
    await catalog.ensureDetail({ targetId: 1, database: "mydb", kind: "table", name: "users" });
    const { result } = renderHook(() => useWorksheetSchemaAdapter(catalog, 1, "mydb"));
    expect(result.current.namespace?.tables).toEqual([{ name: "users", kind: "table" }]);
    expect(result.current.namespace?.loadedColumns?.users).toEqual(["id", "email"]);
  });

  it("columnFetcher returns empty when the table is unknown", async () => {
    const catalog = new SchemaCatalog(createFetch());
    const { result } = renderHook(() => useWorksheetSchemaAdapter(catalog, 1, "mydb"));
    await expect(result.current.columnFetcher!("ghost")).resolves.toEqual([]);
  });
});
