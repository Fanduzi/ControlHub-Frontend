import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuerySchemaStore } from "@/lib/query-schema-store";
import { useWorksheetSchemaAdapter } from "@/lib/use-worksheet-schema-adapter";
import type { ObjectDetailResponse } from "@/types/query-schema";

vi.mock("@/services/query-schema", () => ({
  getObjectDetails: vi.fn(),
}));

import { getObjectDetails } from "@/services/query-schema";

const getObjectDetailsMock = vi.mocked(getObjectDetails);

beforeEach(() => {
  getObjectDetailsMock.mockReset();
});

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

describe("useWorksheetSchemaAdapter", () => {
  describe("namespace derivation", () => {
    it("returns undefined when targetId is missing", () => {
      const store = new QuerySchemaStore();
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, undefined, "mydb", ["mydb"], []),
      );
      expect(result.current.namespace).toBeUndefined();
    });

    it("returns undefined when activeDatabase is missing", () => {
      const store = new QuerySchemaStore();
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, undefined, ["mydb"], []),
      );
      expect(result.current.namespace).toBeUndefined();
    });

    it("builds namespace from loaded objects", () => {
      const store = new QuerySchemaStore();
      const objects = [
        { database: "mydb", name: "users", kind: "table" },
        { database: "mydb", name: "orders", kind: "view" },
      ];
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb", "other"], objects),
      );
      expect(result.current.namespace).toBeDefined();
      expect(result.current.namespace!.tables).toHaveLength(2);
      expect(result.current.namespace!.tables[0].name).toBe("users");
      expect(result.current.namespace!.tables[0].kind).toBe("table");
      expect(result.current.namespace!.tables[1].name).toBe("orders");
      expect(result.current.namespace!.tables[1].kind).toBe("view");
      expect(result.current.namespace!.databases).toEqual(["mydb", "other"]);
    });

    it("includes loaded columns from store detail state", () => {
      const store = new QuerySchemaStore();
      const key = { targetId: 1, database: "mydb", kind: "table", name: "users" };
      store.setDetail(key, buildDetail());

      const objects = [{ database: "mydb", name: "users", kind: "table" }];
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb"], objects),
      );

      expect(result.current.namespace!.loadedColumns!["users"]).toEqual(["id", "email"]);
    });

    it("adds database-qualified column key for non-active database objects", () => {
      const store = new QuerySchemaStore();
      const key = { targetId: 1, database: "other", kind: "table", name: "items" };
      store.setDetail(key, buildDetail({ database: "other", name: "items" }));

      const objects = [{ database: "other", name: "items", kind: "table" }];
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb", "other"], objects),
      );

      expect(result.current.namespace!.loadedColumns!["items"]).toEqual(["id", "email"]);
      expect(result.current.namespace!.loadedColumns!["other.items"]).toEqual(["id", "email"]);
    });
  });

  describe("columnFetcher", () => {
    it("returns empty array when targetId is missing", async () => {
      const store = new QuerySchemaStore();
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, undefined, "mydb", ["mydb"], []),
      );
      const columns = await result.current.columnFetcher!("users");
      expect(columns).toEqual([]);
    });

    it("returns columns from store when detail is ready", async () => {
      const store = new QuerySchemaStore();
      const key = { targetId: 1, database: "mydb", kind: "table", name: "users" };
      store.setDetail(key, buildDetail());

      const objects = [{ database: "mydb", name: "users", kind: "table" }];
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb"], objects),
      );

      const columns = await result.current.columnFetcher!("users");
      expect(columns).toEqual(["id", "email"]);
      expect(getObjectDetailsMock).not.toHaveBeenCalled();
    });

    it("fetches columns when not in store", async () => {
      const store = new QuerySchemaStore();
      getObjectDetailsMock.mockResolvedValueOnce(buildDetail());

      const objects = [{ database: "mydb", name: "users", kind: "table" }];
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb"], objects),
      );

      const columns = await result.current.columnFetcher!("users");
      expect(columns).toEqual(["id", "email"]);
      expect(getObjectDetailsMock).toHaveBeenCalledWith(1, {
        database: "mydb",
        name: "users",
        kind: "table",
      });
    });

    it("returns empty array when table not found in loaded objects", async () => {
      const store = new QuerySchemaStore();
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb"], []),
      );

      const columns = await result.current.columnFetcher!("nonexistent");
      expect(columns).toEqual([]);
      expect(getObjectDetailsMock).not.toHaveBeenCalled();
    });

    it("returns empty array on fetch failure", async () => {
      const store = new QuerySchemaStore();
      getObjectDetailsMock.mockRejectedValueOnce(new Error("network error"));

      const objects = [{ database: "mydb", name: "users", kind: "table" }];
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb"], objects),
      );

      const columns = await result.current.columnFetcher!("users");
      expect(columns).toEqual([]);
    });

    it("resolves database-qualified table name", async () => {
      const store = new QuerySchemaStore();
      const key = { targetId: 1, database: "other", kind: "table", name: "items" };
      store.setDetail(key, buildDetail({ database: "other", name: "items" }));

      const objects = [{ database: "other", name: "items", kind: "table" }];
      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb", "other"], objects),
      );

      const columns = await result.current.columnFetcher!("other.items");
      expect(columns).toEqual(["id", "email"]);
    });
  });

  describe("loadDetail", () => {
    it("fetches and stores detail via the store", async () => {
      const store = new QuerySchemaStore();
      const detail = buildDetail();
      getObjectDetailsMock.mockResolvedValueOnce(detail);

      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb"], []),
      );

      await result.current.loadDetail(1, "mydb", "users", "table");

      const state = store.getDetailState({ targetId: 1, database: "mydb", kind: "table", name: "users" });
      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.data.columns).toHaveLength(2);
      }
    });

    it("sets empty detail on fetch failure", async () => {
      const store = new QuerySchemaStore();
      getObjectDetailsMock.mockRejectedValueOnce(new Error("network error"));

      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb"], []),
      );

      await result.current.loadDetail(1, "mydb", "users", "table");

      const state = store.getDetailState({ targetId: 1, database: "mydb", kind: "table", name: "users" });
      expect(state.status).toBe("error");
    });

    it("skips when concurrency slot is unavailable", async () => {
      const store = new QuerySchemaStore();

      // Acquire all 5 slots
      for (let i = 0; i < 5; i++) {
        store.acquireDetailSlot({ targetId: 1, database: "mydb", kind: "table", name: `t${i}` });
      }

      const { result } = renderHook(() =>
        useWorksheetSchemaAdapter(store, 1, "mydb", ["mydb"], []),
      );

      await result.current.loadDetail(1, "mydb", "users", "table");

      expect(getObjectDetailsMock).not.toHaveBeenCalled();
      const state = store.getDetailState({ targetId: 1, database: "mydb", kind: "table", name: "users" });
      expect(state.status).toBe("idle");
    });
  });
});
