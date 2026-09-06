// input: @/lib/schema-catalog
// output: Vitest tests for schema catalog listings, details, completion namespace
// pos: catalog interface is the test surface (in-memory fetch)
// note: if this file changes, update header and tests/lib/README.md
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COMPLETION_PAGE_SIZE, SchemaCatalog, type SchemaCatalogFetch } from "@/lib/schema-catalog";
import type { ObjectDetailResponse, ObjectSummary } from "@/types/query-schema";
import type { PageInfo } from "@/types/resource";

let now = 0;

beforeEach(() => {
  now = 0;
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  now += ms;
  vi.setSystemTime(now);
}

function pageInfo(overrides: Partial<PageInfo> = {}): PageInfo {
  return {
    page: 1,
    pageSize: 25,
    totalItems: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    ...overrides,
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
      pageInfo: pageInfo({ pageSize: COMPLETION_PAGE_SIZE, totalItems: 2 }),
    }),
    getObjects: async (_targetId, params) => ({
      items: [
        { database: params.database, name: "users", kind: "table" },
        { database: params.database, name: "orders", kind: "view" },
      ] satisfies ObjectSummary[],
      pageInfo: pageInfo({ pageSize: params.pageSize ?? 25, totalItems: 2 }),
    }),
    getObjectDetails: async () => buildDetail(),
    ...overrides,
  };
}

describe("SchemaCatalog listings", () => {
  it("isolates object lists by 库身份 so completions cannot see the other database", async () => {
    const fetch = createFetch({
      getObjects: async (_targetId, params) => ({
        items: [{ database: params.database, name: `${params.database}_table`, kind: "table" }],
        pageInfo: pageInfo(),
      }),
    });
    const catalog = new SchemaCatalog(fetch);

    await catalog.ensureObjects(1, "app", { page: 1, pageSize: COMPLETION_PAGE_SIZE });
    await catalog.ensureObjects(1, "ops", { page: 1, pageSize: COMPLETION_PAGE_SIZE });

    const app = catalog.completionNamespace(1, "app");
    const ops = catalog.completionNamespace(1, "ops");
    expect(app?.tables.map((table) => table.name)).toEqual(["app_table"]);
    expect(ops?.tables.map((table) => table.name)).toEqual(["ops_table"]);
  });

  it("keeps different page sizes from clobbering each other", async () => {
    const fetch = createFetch({
      getDatabases: async (_targetId, params) => ({
        defaultDatabase: "app",
        items: [{ name: `page-size-${params?.pageSize}` }],
        pageInfo: pageInfo({ pageSize: params?.pageSize ?? 25 }),
      }),
    });
    const catalog = new SchemaCatalog(fetch);

    await catalog.ensureDatabases(1, { page: 1, pageSize: 25 });
    await catalog.ensureDatabases(1, { page: 1, pageSize: 100 });

    expect(catalog.getDatabases(1, 25).items).toEqual(["page-size-25"]);
    expect(catalog.getDatabases(1, 100).items).toEqual(["page-size-100"]);
  });

  it("isolates database lists by search and includeSystem and omits false flags", async () => {
    const seen: unknown[] = [];
    const fetch = createFetch({
      getDatabases: async (_targetId, params) => {
        seen.push(params);
        return {
          defaultDatabase: null,
          items: [{ name: params?.q ? `q-${params.q}` : "plain" }],
          pageInfo: pageInfo({ pageSize: params?.pageSize ?? 25 }),
        };
      },
    });
    const catalog = new SchemaCatalog(fetch);

    await catalog.ensureDatabases(1, { page: 1, pageSize: 25 });
    await catalog.ensureDatabases(1, { page: 1, pageSize: 25, q: "app" });
    await catalog.ensureDatabases(1, { page: 1, pageSize: 25, includeSystem: true });

    expect(catalog.getDatabases(1, 25).items).toEqual(["plain"]);
    expect(catalog.getDatabases(1, 25, "app").items).toEqual(["q-app"]);
    expect(catalog.getDatabases(1, 25, "", true).items).toEqual(["plain"]);
    expect(seen[0]).toEqual(expect.objectContaining({ page: 1, pageSize: 25 }));
    expect(seen[0]).not.toHaveProperty("q");
    expect(seen[0]).not.toHaveProperty("includeSystem");
    expect(seen[0]).not.toHaveProperty("refresh");
    expect(seen[1]).toEqual(expect.objectContaining({ q: "app" }));
    expect(seen[2]).toEqual(expect.objectContaining({ includeSystem: true }));
  });

  it("forwards refresh=true on list and detail fetches", async () => {
    const seen: { kind: string; params: unknown }[] = [];
    const fetch = createFetch({
      getDatabases: async (_targetId, params) => {
        seen.push({ kind: "db", params });
        return {
          defaultDatabase: "mydb",
          items: [{ name: "mydb" }],
          pageInfo: pageInfo(),
        };
      },
      getObjects: async (_targetId, params) => {
        seen.push({ kind: "obj", params });
        return {
          items: [{ database: params.database, name: "users", kind: "table" }],
          pageInfo: pageInfo(),
        };
      },
      getObjectDetails: async (_targetId, params) => {
        seen.push({ kind: "detail", params });
        return buildDetail();
      },
    });
    const catalog = new SchemaCatalog(fetch);
    const key = { targetId: 1, database: "mydb", kind: "table", name: "users" };

    await catalog.ensureDatabases(1, { page: 1, pageSize: 25 });
    await catalog.ensureObjects(1, "mydb", { page: 1, pageSize: 25 });
    await catalog.ensureDetail(key);
    await catalog.ensureDatabases(1, { page: 1, pageSize: 25, refresh: true });
    await catalog.ensureObjects(1, "mydb", { page: 1, pageSize: 25, refresh: true });
    await catalog.ensureDetail(key, undefined, true);

    expect(seen.filter((call) => call.kind === "db").at(-1)?.params).toEqual(
      expect.objectContaining({ refresh: true }),
    );
    expect(seen.filter((call) => call.kind === "obj").at(-1)?.params).toEqual(
      expect.objectContaining({ refresh: true }),
    );
    expect(seen.filter((call) => call.kind === "detail").at(-1)?.params).toEqual(
      expect.objectContaining({ refresh: true }),
    );
  });

  it("appends a later page without dropping the first", async () => {
    const fetch = createFetch({
      getDatabases: async (_targetId, params) => ({
        defaultDatabase: "app",
        items: [{ name: `db-${params?.page}` }],
        pageInfo: pageInfo({ page: params?.page ?? 1, pageSize: 25, hasNextPage: params?.page === 1 }),
      }),
    });
    const catalog = new SchemaCatalog(fetch);

    await catalog.ensureDatabases(1, { page: 1, pageSize: 25, replace: true });
    await catalog.ensureDatabases(1, { page: 2, pageSize: 25, replace: false });

    expect(catalog.getDatabases(1, 25).items).toEqual(["db-1", "db-2"]);
    expect(catalog.getDatabases(1, 25).pageInfo?.page).toBe(2);
  });

  it("ignores a stale list response after abort", async () => {
    let resolveFirst: (value: {
      defaultDatabase: string | null;
      items: { name: string }[];
      pageInfo: PageInfo;
    }) => void = () => {};
    const first = new Promise<{
      defaultDatabase: string | null;
      items: { name: string }[];
      pageInfo: PageInfo;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetch = createFetch({
      getDatabases: () => {
        calls += 1;
        if (calls === 1) return first;
        return Promise.resolve({
          defaultDatabase: "ops",
          items: [{ name: "ops" }],
          pageInfo: pageInfo(),
        });
      },
    });
    const catalog = new SchemaCatalog(fetch);
    const controller = new AbortController();

    const pending = catalog.ensureDatabases(1, { page: 1, pageSize: 25, signal: controller.signal });
    controller.abort();
    await catalog.ensureDatabases(1, { page: 1, pageSize: 25, replace: true });
    resolveFirst({
      defaultDatabase: "stale",
      items: [{ name: "stale" }],
      pageInfo: pageInfo(),
    });
    await pending;

    expect(catalog.getDatabases(1, 25).items).toEqual(["ops"]);
  });

  it("notifies subscribers when a listing becomes ready", async () => {
    const catalog = new SchemaCatalog(createFetch());
    const listener = vi.fn();
    catalog.subscribe(listener);
    await catalog.ensureDatabases(1, { page: 1, pageSize: 25 });
    expect(listener.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("SchemaCatalog details", () => {
  it("returns ready columns within the positive TTL", async () => {
    const catalog = new SchemaCatalog(createFetch());
    const key = { targetId: 1, database: "mydb", kind: "table", name: "users" };
    await catalog.ensureDetail(key);
    advance(4 * 60 * 1000);
    const state = catalog.getDetailState(key);
    expect(state.status).toBe("ready");
  });

  it("marks detail stale after five minutes", async () => {
    const catalog = new SchemaCatalog(createFetch());
    const key = { targetId: 1, database: "mydb", kind: "table", name: "users" };
    await catalog.ensureDetail(key);
    advance(5 * 60 * 1000 + 1);
    expect(catalog.getDetailState(key).status).toBe("stale");
  });

  it("negative-caches a failed detail for 30 seconds", async () => {
    const catalog = new SchemaCatalog(
      createFetch({
        getObjectDetails: async () => {
          throw new Error("empty");
        },
      }),
    );
    const key = { targetId: 1, database: "mydb", kind: "table", name: "users" };
    await catalog.ensureDetail(key);
    expect(catalog.getDetailState(key).status).toBe("error");
    advance(30 * 1000 + 1);
    expect(catalog.getDetailState(key).status).toBe("idle");
  });

  it("evicts the oldest detail after 50 entries", async () => {
    let name = "users";
    const catalog = new SchemaCatalog(
      createFetch({
        getObjectDetails: async (_targetId, params) => buildDetail({ name: params.name }),
      }),
    );
    for (let i = 0; i < 51; i++) {
      name = `table_${i}`;
      await catalog.ensureDetail({ targetId: 1, database: "mydb", kind: "table", name });
    }
    expect(catalog.getDetailState({ targetId: 1, database: "mydb", kind: "table", name: "table_0" }).status).toBe("idle");
    expect(catalog.getDetailState({ targetId: 1, database: "mydb", kind: "table", name: "table_50" }).status).toBe("ready");
  });

  it("does not start a sixth concurrent detail fetch", async () => {
    const started: string[] = [];
    const catalog = new SchemaCatalog(
      createFetch({
        getObjectDetails: async (_targetId, params) => {
          started.push(params.name);
          await new Promise(() => {});
          return buildDetail({ name: params.name });
        },
      }),
    );
    void Array.from({ length: 6 }, (_, i) =>
      catalog.ensureDetail({ targetId: 1, database: "mydb", kind: "table", name: `t${i}` }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toHaveLength(5);
  });

  it("joins identical in-flight detail requests", async () => {
    let calls = 0;
    const catalog = new SchemaCatalog(
      createFetch({
        getObjectDetails: async () => {
          calls += 1;
          return buildDetail();
        },
      }),
    );
    const key = { targetId: 1, database: "mydb", kind: "table", name: "users" };
    await Promise.all([catalog.ensureDetail(key), catalog.ensureDetail(key)]);
    expect(calls).toBe(1);
  });

  it("ignores a superseded detail write", async () => {
    let resolveFirst: (value: ObjectDetailResponse) => void = () => {};
    const first = new Promise<ObjectDetailResponse>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const catalog = new SchemaCatalog(
      createFetch({
        getObjectDetails: () => {
          calls += 1;
          if (calls === 1) return first;
          return Promise.resolve(buildDetail({ name: "second" }));
        },
      }),
    );
    const key = { targetId: 1, database: "mydb", kind: "table", name: "users" };
    const controller = new AbortController();
    const pending = catalog.ensureDetail(key, controller.signal);
    controller.abort();
    resolveFirst(buildDetail({ name: "first" }));
    await pending;
    await catalog.ensureDetail(key);
    const state = catalog.getDetailState(key);
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.data.name).toBe("second");
    }
  });

  it("clear drops listings and details", async () => {
    const catalog = new SchemaCatalog(createFetch());
    await catalog.ensureDatabases(1, { page: 1, pageSize: 25 });
    await catalog.ensureDetail({ targetId: 1, database: "mydb", kind: "table", name: "users" });
    catalog.clear();
    expect(catalog.getDatabases(1, 25).status).toBe("idle");
    expect(catalog.getDetailState({ targetId: 1, database: "mydb", kind: "table", name: "users" }).status).toBe("idle");
  });

  it("does not persist to web storage", async () => {
    const catalog = new SchemaCatalog(createFetch());
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    await catalog.ensureDetail({ targetId: 1, database: "mydb", kind: "table", name: "users" });
    catalog.getDetailState({ targetId: 1, database: "mydb", kind: "table", name: "users" });
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe("SchemaCatalog completion namespace", () => {
  it("offers only database names before a database is selected", async () => {
    const catalog = new SchemaCatalog(createFetch());
    await catalog.ensureDatabases(1, { page: 1, pageSize: COMPLETION_PAGE_SIZE });
    const namespace = catalog.completionNamespace(1, undefined);
    expect(namespace?.databases).toEqual(["mydb", "other"]);
    expect(namespace?.tables).toEqual([]);
  });

  it("returns undefined without a query target", () => {
    const catalog = new SchemaCatalog(createFetch());
    expect(catalog.completionNamespace(undefined, "mydb")).toBeUndefined();
  });

  it("fills loaded columns from ready details", async () => {
    const catalog = new SchemaCatalog(createFetch());
    await catalog.ensureObjects(1, "mydb", { page: 1, pageSize: COMPLETION_PAGE_SIZE });
    await catalog.ensureDetail({ targetId: 1, database: "mydb", kind: "table", name: "users" });
    const namespace = catalog.completionNamespace(1, "mydb");
    expect(namespace?.loadedColumns?.users).toEqual(["id", "email"]);
  });

  it("columnsFor reads ready details without refetching", async () => {
    let calls = 0;
    const catalog = new SchemaCatalog(
      createFetch({
        getObjectDetails: async () => {
          calls += 1;
          return buildDetail();
        },
      }),
    );
    await catalog.ensureObjects(1, "mydb", { page: 1, pageSize: COMPLETION_PAGE_SIZE });
    await catalog.ensureDetail({ targetId: 1, database: "mydb", kind: "table", name: "users" });
    const columns = await catalog.columnsFor(1, "mydb", "users");
    expect(columns).toEqual(["id", "email"]);
    expect(calls).toBe(1);
  });
});
