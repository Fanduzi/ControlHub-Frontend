// input: @/services/query-schema, @/lib/query-sql-completion, @/types/query-schema
// output: SchemaCatalog (lists + details + completion namespace, keyed by 库身份)
// pos: single in-process schema catalog for the query workbench
// note: if this file changes, update header and lib/README.md
import { useSyncExternalStore } from "react";

import {
  getObjectDetails,
  getSchemaDatabases,
  getSchemaObjects,
  getSchemaSchemas,
} from "@/services/query-schema";
import type { SchemaNamespace } from "@/lib/query-sql-completion";
import type {
  ObjectDetailResponse,
  ObjectSummary,
  SchemaDatabaseListParams,
  SchemaListParams,
  SchemaObjectDetailParams,
  SchemaObjectListParams,
} from "@/types/query-schema";
import type { PageInfo } from "@/types/resource";

/** Page size the worksheet uses for SQL completion vocabulary. */
export const COMPLETION_PAGE_SIZE = 100;

export type SchemaCatalogFetch = {
  readonly getDatabases: (
    targetId: number,
    params?: SchemaDatabaseListParams,
  ) => Promise<{
    readonly defaultDatabase: string | null;
    readonly items: readonly { readonly name: string }[];
    readonly pageInfo: PageInfo;
  }>;
  readonly getSchemas: (
    targetId: number,
    params: SchemaListParams,
  ) => Promise<{
    readonly items: readonly { readonly name: string }[];
    readonly pageInfo: PageInfo;
  }>;
  readonly getObjects: (
    targetId: number,
    params: SchemaObjectListParams,
  ) => Promise<{
    readonly items: readonly ObjectSummary[];
    readonly pageInfo: PageInfo;
  }>;
  readonly getObjectDetails: (
    targetId: number,
    params: SchemaObjectDetailParams,
  ) => Promise<ObjectDetailResponse>;
};

const defaultFetch: SchemaCatalogFetch = {
  getDatabases: getSchemaDatabases,
  getSchemas: getSchemaSchemas,
  getObjects: getSchemaObjects,
  getObjectDetails: getObjectDetails,
};

export type SchemaStoreKey = {
  readonly targetId: number;
  readonly database: string;
  /** PostgreSQL namespace pin; empty string for MySQL/TiDB. */
  readonly schema: string;
  readonly kind: string;
  readonly name: string;
};

export type DetailState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: ObjectDetailResponse }
  | { readonly status: "error"; readonly error: string }
  | { readonly status: "stale"; readonly data: ObjectDetailResponse };

export type SchemaListStatus = "idle" | "loading" | "ready" | "error";

export type DatabaseListing = {
  readonly items: readonly string[];
  readonly defaultDatabase: string | null;
  readonly pageInfo: PageInfo | null;
  readonly status: SchemaListStatus;
};

/** PostgreSQL namespace list for one connection (targetId, database). */
export type SchemaListing = {
  readonly items: readonly string[];
  readonly pageInfo: PageInfo | null;
  readonly status: SchemaListStatus;
};

export type ObjectListing = {
  readonly items: readonly ObjectSummary[];
  readonly pageInfo: PageInfo | null;
  readonly status: SchemaListStatus;
};

const POSITIVE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 1000;
const MAX_DETAIL_ENTRIES = 50;
const MAX_CONCURRENT_REQUESTS = 5;

const emptyDatabaseListing: DatabaseListing = {
  items: [],
  defaultDatabase: null,
  pageInfo: null,
  status: "idle",
};

const emptyObjectListing: ObjectListing = {
  items: [],
  pageInfo: null,
  status: "idle",
};

const emptySchemaListing: SchemaListing = {
  items: [],
  pageInfo: null,
  status: "idle",
};

type DatabaseEntry = {
  items: string[];
  defaultDatabase: string | null;
  pageInfo: PageInfo | null;
  status: SchemaListStatus;
  generation: number;
};

type SchemaEntry = {
  items: string[];
  pageInfo: PageInfo | null;
  status: SchemaListStatus;
  generation: number;
};

type ObjectEntry = {
  targetId: number;
  database: string;
  schema: string;
  q: string;
  items: ObjectSummary[];
  pageInfo: PageInfo | null;
  status: SchemaListStatus;
  generation: number;
};

type DetailEntry = {
  readonly data: ObjectDetailResponse;
  readonly insertedAt: number;
};

type EmptyEntry = {
  readonly insertedAt: number;
};

function serializeDetailKey(key: SchemaStoreKey): string {
  return `det:${JSON.stringify([key.targetId, key.database, key.schema, key.kind, key.name])}`;
}

function databaseKey(
  targetId: number,
  pageSize: number,
  q = "",
  includeSystem = false,
): string {
  return `db:${targetId}:${pageSize}:${q}:${includeSystem ? 1 : 0}`;
}

function schemaKey(targetId: number, database: string): string {
  return `sch:${JSON.stringify([targetId, database])}`;
}

function objectKey(
  targetId: number,
  database: string,
  schema: string,
  pageSize: number,
  q: string,
): string {
  return `obj:${JSON.stringify([targetId, database, schema, pageSize, q])}`;
}

function dedupeNames(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function dedupeObjects(items: readonly ObjectSummary[]): ObjectSummary[] {
  const seen = new Set<string>();
  return items.filter((object) => {
    const key = JSON.stringify([object.schema ?? "", object.kind, object.name]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * In-process schema catalog. Callers pass page size and search.
 * Slot/TTL/dedupe/stale rejection stay inside.
 */
export class SchemaCatalog {
  private readonly databases = new Map<string, DatabaseEntry>();
  private readonly schemas = new Map<string, SchemaEntry>();
  private readonly objects = new Map<string, ObjectEntry>();
  private readonly details = new Map<string, DetailEntry>();
  private readonly empties = new Map<string, EmptyEntry>();
  private readonly loadingDetails = new Map<string, number>();
  private readonly inflightDetails = new Map<string, Promise<void>>();
  private readonly activeDetailSlots = new Set<string>();
  private detailGeneration = 0;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private completionMemo: {
    readonly key: string;
    readonly catalogVersion: number;
    readonly value: SchemaNamespace | undefined;
  } | null = null;

  constructor(private readonly fetch: SchemaCatalogFetch = defaultFetch) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): number {
    return this.version;
  }

  getDatabases(
    targetId: number,
    pageSize: number,
    q = "",
    includeSystem = false,
  ): DatabaseListing {
    const entry = this.databases.get(databaseKey(targetId, pageSize, q, includeSystem));
    if (!entry) return emptyDatabaseListing;
    return {
      items: entry.items,
      defaultDatabase: entry.defaultDatabase,
      pageInfo: entry.pageInfo,
      status: entry.status,
    };
  }

  getDefaultDatabase(targetId: number): string | null {
    for (const [key, entry] of this.databases) {
      if (key.startsWith(`db:${targetId}:`) && entry.defaultDatabase) {
        return entry.defaultDatabase;
      }
    }
    return null;
  }

  /**
   * PostgreSQL namespaces of one connection. `items` are verbatim names —
   * casing/whitespace preserved for quoted identifiers.
   */
  getSchemas(targetId: number, database: string): SchemaListing {
    const entry = this.schemas.get(schemaKey(targetId, database));
    if (!entry) return emptySchemaListing;
    return {
      items: entry.items,
      pageInfo: entry.pageInfo,
      status: entry.status,
    };
  }

  getObjects(
    targetId: number,
    database: string,
    pageSize: number,
    q = "",
    schema = "",
  ): ObjectListing {
    const entry = this.objects.get(objectKey(targetId, database, schema, pageSize, q));
    if (!entry) return emptyObjectListing;
    return {
      items: entry.items,
      pageInfo: entry.pageInfo,
      status: entry.status,
    };
  }

  getDetailState(key: SchemaStoreKey): DetailState {
    const keyStr = serializeDetailKey(key);
    const now = Date.now();
    if (this.loadingDetails.has(keyStr)) {
      return { status: "loading" };
    }
    const detail = this.details.get(keyStr);
    if (detail) {
      const age = now - detail.insertedAt;
      if (age < POSITIVE_TTL_MS) {
        return { status: "ready", data: detail.data };
      }
      return { status: "stale", data: detail.data };
    }
    const empty = this.empties.get(keyStr);
    if (empty) {
      const age = now - empty.insertedAt;
      if (age < NEGATIVE_TTL_MS) {
        return { status: "error", error: "empty" };
      }
    }
    return { status: "idle" };
  }

  async ensureDatabases(
    targetId: number,
    options: {
      readonly page: number;
      readonly pageSize: number;
      readonly q?: string;
      readonly includeSystem?: boolean;
      readonly refresh?: boolean;
      readonly replace?: boolean;
      readonly signal?: AbortSignal;
    },
  ): Promise<void> {
    const q = options.q ?? "";
    const includeSystem = options.includeSystem === true;
    const key = databaseKey(targetId, options.pageSize, q, includeSystem);
    const replace = options.replace !== false;
    let entry = this.databases.get(key);
    if (!entry) {
      entry = {
        items: [],
        defaultDatabase: null,
        pageInfo: null,
        status: "idle",
        generation: 0,
      };
      this.databases.set(key, entry);
    }
    if (replace) {
      entry.generation += 1;
      entry.items = [];
      entry.pageInfo = null;
    }
    const generation = entry.generation;
    entry.status = "loading";
    this.notify();

    try {
      const response = await this.fetch.getDatabases(targetId, {
        page: options.page,
        pageSize: options.pageSize,
        ...(q ? { q } : {}),
        ...(includeSystem ? { includeSystem: true } : {}),
        ...(options.refresh ? { refresh: true } : {}),
        signal: options.signal,
      });
      if (options.signal?.aborted || generation !== entry.generation) return;
      const names = response.items.map((item) => item.name);
      entry.items = replace ? dedupeNames(names) : dedupeNames([...entry.items, ...names]);
      entry.pageInfo = response.pageInfo;
      entry.defaultDatabase = response.defaultDatabase;
      entry.status = "ready";
      this.notify();
    } catch {
      if (options.signal?.aborted || generation !== entry.generation) return;
      entry.status = "error";
      this.notify();
    }
  }

  /**
   * Fetch namespaces for one PostgreSQL connection. Entries are scoped to
   * (targetId, database) — never shared across connections.
   */
  async ensureSchemas(
    targetId: number,
    database: string,
    options: {
      readonly refresh?: boolean;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<void> {
    const key = schemaKey(targetId, database);
    let entry = this.schemas.get(key);
    if (!entry) {
      entry = { items: [], pageInfo: null, status: "idle", generation: 0 };
      this.schemas.set(key, entry);
    }
    if (entry.status === "loading") return;
    const generation = entry.generation + 1;
    entry.generation = generation;
    entry.status = "loading";
    this.notify();

    try {
      // The schema API caps pageSize at 100; paginate until the server reports
      // no further page so large catalogs are not silently clipped.
      const names: string[] = [];
      let page = 1;
      let pageInfo: PageInfo | null = null;
      for (;;) {
        const response = await this.fetch.getSchemas(targetId, {
          database,
          page,
          pageSize: 100,
          ...(options.refresh ? { refresh: true } : {}),
          signal: options.signal,
        });
        if (options.signal?.aborted || generation !== entry.generation) return;
        names.push(...response.items.map((item) => item.name));
        pageInfo = response.pageInfo;
        if (!response.pageInfo.hasNextPage) break;
        page += 1;
      }
      entry.items = dedupeNames(names);
      entry.pageInfo = pageInfo;
      entry.status = "ready";
      this.notify();
    } catch {
      if (options.signal?.aborted || generation !== entry.generation) return;
      entry.status = "error";
      this.notify();
    }
  }

  async ensureObjects(
    targetId: number,
    database: string,
    options: {
      readonly page: number;
      readonly pageSize: number;
      readonly schema?: string;
      readonly q?: string;
      readonly refresh?: boolean;
      readonly replace?: boolean;
      readonly signal?: AbortSignal;
    },
  ): Promise<void> {
    const q = options.q ?? "";
    const schema = options.schema ?? "";
    const key = objectKey(targetId, database, schema, options.pageSize, q);
    const replace = options.replace !== false;
    let entry = this.objects.get(key);
    if (!entry) {
      entry = {
        targetId,
        database,
        schema,
        q,
        items: [],
        pageInfo: null,
        status: "idle",
        generation: 0,
      };
      this.objects.set(key, entry);
    }
    if (replace) {
      entry.generation += 1;
      entry.items = [];
      entry.pageInfo = null;
    }
    const generation = entry.generation;
    entry.status = "loading";
    this.notify();

    try {
      const response = await this.fetch.getObjects(targetId, {
        database,
        ...(schema ? { schema } : {}),
        ...(q ? { q } : {}),
        page: options.page,
        pageSize: options.pageSize,
        ...(options.refresh ? { refresh: true } : {}),
        signal: options.signal,
      });
      if (options.signal?.aborted || generation !== entry.generation) return;
      entry.items = replace
        ? dedupeObjects(response.items)
        : dedupeObjects([...entry.items, ...response.items]);
      entry.pageInfo = response.pageInfo;
      entry.status = "ready";
      this.notify();
    } catch {
      if (options.signal?.aborted || generation !== entry.generation) return;
      entry.status = "error";
      this.notify();
    }
  }

  async ensureDetail(
    key: SchemaStoreKey,
    signal?: AbortSignal,
    refresh = false,
  ): Promise<void> {
    const keyStr = serializeDetailKey(key);
    if (!refresh) {
      const state = this.getDetailState(key);
      if (state.status === "ready") return;
      const existing = this.inflightDetails.get(keyStr);
      if (existing) {
        await existing;
        if (this.getDetailState(key).status === "ready" || signal?.aborted) return;
      }
    }
    if (this.activeDetailSlots.size >= MAX_CONCURRENT_REQUESTS) {
      return;
    }
    this.activeDetailSlots.add(keyStr);
    this.detailGeneration += 1;
    const generation = this.detailGeneration;
    this.loadingDetails.set(keyStr, generation);
    this.notify();

    const work = (async () => {
      try {
        const detail = await this.fetch.getObjectDetails(key.targetId, {
          database: key.database,
          ...(key.schema ? { schema: key.schema } : {}),
          name: key.name,
          kind: key.kind as "table" | "view",
          ...(refresh ? { refresh: true } : {}),
          signal,
        });
        if (signal?.aborted) return;
        if (this.loadingDetails.get(keyStr) !== generation) return;
        this.loadingDetails.delete(keyStr);
        this.empties.delete(keyStr);
        if (this.details.size >= MAX_DETAIL_ENTRIES && !this.details.has(keyStr)) {
          this.evictOldestDetail();
        }
        this.details.set(keyStr, { data: detail, insertedAt: Date.now() });
        this.notify();
      } catch {
        if (signal?.aborted) return;
        if (this.loadingDetails.get(keyStr) !== generation) return;
        this.loadingDetails.delete(keyStr);
        this.details.delete(keyStr);
        this.empties.set(keyStr, { insertedAt: Date.now() });
        this.notify();
      } finally {
        this.activeDetailSlots.delete(keyStr);
        this.inflightDetails.delete(keyStr);
      }
    })();

    this.inflightDetails.set(keyStr, work);
    await work;
  }

  completionNamespace(
    targetId: number | undefined,
    activeDatabase: string | undefined,
    activeSchema?: string,
    postgres = false,
  ): SchemaNamespace | undefined {
    const key = `${postgres ? "pg" : "db"}:${targetId ?? ""}:${activeDatabase ?? ""}:${activeSchema ?? ""}`;
    if (
      this.completionMemo &&
      this.completionMemo.key === key &&
      this.completionMemo.catalogVersion === this.version
    ) {
      return this.completionMemo.value;
    }
    const value = this.buildCompletionNamespace(targetId, activeDatabase, activeSchema ?? "", postgres);
    this.completionMemo = { key, catalogVersion: this.version, value };
    return value;
  }

  private buildCompletionNamespace(
    targetId: number | undefined,
    activeDatabase: string | undefined,
    activeSchema: string,
    pg: boolean,
  ): SchemaNamespace | undefined {
    if (!targetId) return undefined;
    const databases = pg
      ? this.getSchemas(targetId, activeDatabase ?? "").items.map(
          (name) => name,
        )
      : this.getDatabases(targetId, COMPLETION_PAGE_SIZE).items;
    if (!activeDatabase) {
      return { tables: [], databases, loadedColumns: {} };
    }
    const objects = this.getObjects(
      targetId,
      activeDatabase,
      COMPLETION_PAGE_SIZE,
      "",
      activeSchema,
    ).items;
    const loadedColumns: Record<string, readonly string[]> = {};
    for (const object of objects) {
      const state = this.getDetailState({
        targetId,
        database: object.database,
        schema: object.schema ?? activeSchema,
        kind: object.kind,
        name: object.name,
      });
      if (state.status !== "ready") continue;
      const names = state.data.columns.map((column) => column.name);
      loadedColumns[object.name] = names;
      if (pg && (object.schema ?? "") !== "" && object.schema !== activeSchema) {
        loadedColumns[`${object.schema}.${object.name}`] = names;
      } else if (!pg && object.database !== activeDatabase) {
        loadedColumns[`${object.database}.${object.name}`] = names;
      }
    }
    return {
      tables: objects.map((object) => ({
        name: object.name,
        kind: object.kind,
      })),
      databases,
      loadedColumns,
    };
  }

  async columnsFor(
    targetId: number | undefined,
    activeDatabase: string | undefined,
    table: string,
    activeSchema?: string,
    postgres = false,
  ): Promise<readonly string[]> {
    if (!targetId || !activeDatabase) return [];
    const object = this.findObject(targetId, activeDatabase, table, activeSchema ?? "", postgres);
    if (!object) return [];
    const key: SchemaStoreKey = {
      targetId,
      database: object.database,
      schema: object.schema ?? activeSchema ?? "",
      kind: object.kind,
      name: object.name,
    };
    const ready = this.getDetailState(key);
    if (ready.status === "ready") {
      return ready.data.columns.map((column) => column.name);
    }
    await this.ensureDetail(key);
    const next = this.getDetailState(key);
    if (next.status === "ready") {
      return next.data.columns.map((column) => column.name);
    }
    return [];
  }

  invalidateDatabases(targetId: number, pageSize: number): void {
    const prefix = `db:${targetId}:${pageSize}:`;
    let changed = false;
    for (const [key, entry] of this.databases) {
      if (!key.startsWith(prefix)) continue;
      entry.generation += 1;
      entry.items = [];
      entry.pageInfo = null;
      entry.defaultDatabase = null;
      entry.status = "idle";
      changed = true;
    }
    if (changed) this.notify();
  }

  invalidateObjects(
    targetId: number,
    database: string,
    pageSize: number,
    q = "",
    schema = "",
  ): void {
    const key = objectKey(targetId, database, schema, pageSize, q);
    const entry = this.objects.get(key);
    if (!entry) return;
    entry.generation += 1;
    entry.items = [];
    entry.pageInfo = null;
    entry.status = "idle";
    this.notify();
  }

  invalidateSchemas(targetId: number, database: string): void {
    const key = schemaKey(targetId, database);
    const entry = this.schemas.get(key);
    if (!entry) return;
    entry.generation += 1;
    entry.items = [];
    entry.pageInfo = null;
    entry.status = "idle";
    this.notify();
  }

  clear(): void {
    this.databases.clear();
    this.schemas.clear();
    this.objects.clear();
    this.details.clear();
    this.empties.clear();
    this.loadingDetails.clear();
    this.inflightDetails.clear();
    this.activeDetailSlots.clear();
    this.notify();
  }

  private findObject(
    targetId: number,
    activeDatabase: string,
    table: string,
    activeSchema: string,
    pg: boolean,
  ): ObjectSummary | null {
    const completion = this.getObjects(
      targetId,
      activeDatabase,
      COMPLETION_PAGE_SIZE,
      "",
      activeSchema,
    ).items;
    const qualified = pg
      ? (name: string, schema: string | undefined) =>
          name === table || `${schema ?? ""}.${name}` === table
      : (name: string) => name === table || `${activeDatabase}.${name}` === table;
    const hit =
      completion.find((object) => qualified(object.name, object.schema)) ?? null;
    if (hit) return hit;
    for (const entry of this.objects.values()) {
      if (entry.targetId !== targetId) continue;
      if (entry.database !== activeDatabase) continue;
      // PostgreSQL: an unqualified name resolves only inside the active
      // schema's listing — a same-named object in a sibling schema is a
      // different relation, never a fallback hit.
      if (pg && entry.schema !== activeSchema) continue;
      const found = entry.items.find((object) => qualified(object.name, object.schema));
      if (found) return found;
    }
    return null;
  }

  private evictOldestDetail(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of this.details) {
      if (entry.insertedAt < oldestTime) {
        oldestTime = entry.insertedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.details.delete(oldestKey);
  }

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

/** Subscribe a React adapter to catalog notifications. */
export function useSchemaCatalogVersion(catalog: SchemaCatalog): number {
  return useSyncExternalStore(
    (listener) => catalog.subscribe(listener),
    () => catalog.getSnapshot(),
    () => catalog.getSnapshot(),
  );
}
