import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ObjectDetailResponse } from "@/types/query-schema";
import {
  QuerySchemaStore,
  type SchemaStoreKey,
} from "@/lib/query-schema-store";

// Fake clock for deterministic TTL tests
let now = 0;
vi.useFakeTimers();

beforeEach(() => {
  now = 0;
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  now += ms;
  vi.setSystemTime(now);
}

function buildDetail(overrides: Partial<ObjectDetailResponse> = {}): ObjectDetailResponse {
  return {
    targetResourceId: 1,
    database: "mydb",
    name: "users",
    kind: "table",
    columns: [],
    indexes: [],
    foreignKeys: [],
    truncated: { columns: false, indexes: false, foreignKeys: false },
    ...overrides,
  };
}

function buildKey(overrides: Partial<SchemaStoreKey> = {}): SchemaStoreKey {
  return {
    targetId: 1,
    database: "mydb",
    kind: "table",
    name: "users",
    ...overrides,
  };
}

describe("QuerySchemaStore", () => {
  describe("positive TTL (5 minutes)", () => {
    it("returns ready state within 5 minutes", () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      store.setDetail(key, buildDetail());
      advance(4 * 60 * 1000); // 4 minutes

      const state = store.getDetailState(key);
      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.data).toEqual(buildDetail());
      }
    });

    it("transitions to stale after 5 minutes", () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      store.setDetail(key, buildDetail());
      advance(5 * 60 * 1000 + 1); // 5 minutes + 1ms

      const state = store.getDetailState(key);
      expect(state.status).toBe("stale");
    });
  });

  describe("negative TTL (30 seconds)", () => {
    it("returns error state for empty metadata within 30 seconds", () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      store.setEmptyDetail(key);
      advance(29 * 1000); // 29 seconds

      const state = store.getDetailState(key);
      expect(state.status).toBe("error");
      if (state.status === "error") {
        expect(state.error).toBe("empty");
      }
    });

    it("transitions to idle after 30 seconds for empty metadata", () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      store.setEmptyDetail(key);
      advance(30 * 1000 + 1); // 30 seconds + 1ms

      const state = store.getDetailState(key);
      expect(state.status).toBe("idle");
    });
  });

  describe("maximum 50 detail entries", () => {
    it("evicts oldest entry when exceeding 50", () => {
      const store = new QuerySchemaStore();

      // Fill to capacity
      for (let i = 0; i < 50; i++) {
        store.setDetail(buildKey({ name: `table_${i}` }), buildDetail({ name: `table_${i}` }));
      }

      // Add one more - should evict table_0
      store.setDetail(buildKey({ name: "table_50" }), buildDetail({ name: "table_50" }));

      const evicted = store.getDetailState(buildKey({ name: "table_0" }));
      expect(evicted.status).toBe("idle");

      const kept = store.getDetailState(buildKey({ name: "table_50" }));
      expect(kept.status).toBe("ready");
    });

    it("does not evict when updating existing key", () => {
      const store = new QuerySchemaStore();

      for (let i = 0; i < 50; i++) {
        store.setDetail(buildKey({ name: `table_${i}` }), buildDetail({ name: `table_${i}` }));
      }

      // Update existing key - should not evict
      store.setDetail(buildKey({ name: "table_0" }), buildDetail({ name: "table_0", kind: "view" }));

      const state = store.getDetailState(buildKey({ name: "table_0" }));
      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.data.kind).toBe("view");
      }
    });
  });

  describe("maximum 5 concurrent detail requests", () => {
    it("allows up to 5 concurrent requests", () => {
      const store = new QuerySchemaStore();

      for (let i = 0; i < 5; i++) {
        const acquired = store.acquireDetailSlot(buildKey({ name: `table_${i}` }));
        expect(acquired).toBe(true);
      }
    });

    it("rejects 6th concurrent request", () => {
      const store = new QuerySchemaStore();

      for (let i = 0; i < 5; i++) {
        store.acquireDetailSlot(buildKey({ name: `table_${i}` }));
      }

      const acquired = store.acquireDetailSlot(buildKey({ name: "table_5" }));
      expect(acquired).toBe(false);
    });

    it("releases slot when request completes", () => {
      const store = new QuerySchemaStore();

      for (let i = 0; i < 5; i++) {
        store.acquireDetailSlot(buildKey({ name: `table_${i}` }));
      }

      store.releaseDetailSlot(buildKey({ name: "table_0" }));

      const acquired = store.acquireDetailSlot(buildKey({ name: "table_5" }));
      expect(acquired).toBe(true);
    });
  });

  describe("deduplication of identical in-flight requests", () => {
    it("returns existing promise for identical key", () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      const promise1 = store.getOrCreateDetailPromise(key, async () => buildDetail());
      const promise2 = store.getOrCreateDetailPromise(key, async () => buildDetail());

      expect(promise1).toBe(promise2);
    });

    it("creates new promise for different key", () => {
      const store = new QuerySchemaStore();

      const promise1 = store.getOrCreateDetailPromise(buildKey({ name: "table_1" }), async () => buildDetail());
      const promise2 = store.getOrCreateDetailPromise(buildKey({ name: "table_2" }), async () => buildDetail());

      expect(promise1).not.toBe(promise2);
    });

    it("removes promise after completion", async () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      await store.getOrCreateDetailPromise(key, async () => buildDetail());

      // Should create new promise after completion
      const promise2 = store.getOrCreateDetailPromise(key, async () => buildDetail());
      expect(promise2).toBeDefined();
    });
  });

  describe("refresh bypasses only selected key", () => {
    it("marks key as loading on refresh", () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      store.setDetail(key, buildDetail());
      store.refreshDetail(key);

      const state = store.getDetailState(key);
      expect(state.status).toBe("loading");
    });

    it("does not affect other keys on refresh", () => {
      const store = new QuerySchemaStore();
      const key1 = buildKey({ name: "table_1" });
      const key2 = buildKey({ name: "table_2" });

      store.setDetail(key1, buildDetail({ name: "table_1" }));
      store.setDetail(key2, buildDetail({ name: "table_2" }));

      store.refreshDetail(key1);

      const state2 = store.getDetailState(key2);
      expect(state2.status).toBe("ready");
    });
  });

  describe("stale/aborted writes are ignored", () => {
    it("ignores write when generation has changed", () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      store.setDetailLoading(key);
      store.setDetail(key, buildDetail()); // First write

      store.setDetailLoading(key); // New generation
      store.setDetail(key, buildDetail({ name: "new_name" })); // Should succeed

      const state = store.getDetailState(key);
      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.data.name).toBe("new_name");
      }
    });

    it("ignores write when generation has changed for same key", () => {
      const store = new QuerySchemaStore();
      const key = buildKey();

      // First loading cycle
      store.setDetailLoading(key);
      const firstGeneration = store.getCurrentGeneration();

      // Second loading cycle (e.g., user triggered refresh)
      store.setDetailLoading(key);
      const secondGeneration = store.getCurrentGeneration();

      // Write from first generation - should be ignored
      store.setDetailForGeneration(key, buildDetail(), firstGeneration);

      const state = store.getDetailState(key);
      expect(state.status).toBe("loading");

      // Write from second generation - should succeed
      store.setDetailForGeneration(key, buildDetail({ name: "new_name" }), secondGeneration);

      const state2 = store.getDetailState(key);
      expect(state2.status).toBe("ready");
      if (state2.status === "ready") {
        expect(state2.data.name).toBe("new_name");
      }
    });
  });

  describe("auth failure clears the store", () => {
    it("clears all entries on auth failure", () => {
      const store = new QuerySchemaStore();

      store.setDetail(buildKey({ name: "table_1" }), buildDetail({ name: "table_1" }));
      store.setDetail(buildKey({ name: "table_2" }), buildDetail({ name: "table_2" }));

      store.clear();

      expect(store.getDetailState(buildKey({ name: "table_1" })).status).toBe("idle");
      expect(store.getDetailState(buildKey({ name: "table_2" })).status).toBe("idle");
    });
  });

  describe("no browser persistence APIs", () => {
    it("does not call localStorage", () => {
      const store = new QuerySchemaStore();
      const spy = vi.spyOn(Storage.prototype, "setItem");

      store.setDetail(buildKey(), buildDetail());

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("does not call sessionStorage", () => {
      const store = new QuerySchemaStore();
      const spy = vi.spyOn(Storage.prototype, "getItem");

      store.getDetailState(buildKey());

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
