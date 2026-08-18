import { useCallback, useMemo } from "react";

import { getObjectDetails } from "@/services/query-schema";
import type { QuerySchemaStore, SchemaStoreKey } from "@/lib/query-schema-store";
import type { SchemaNamespace, TableColumnFetcher } from "@/lib/query-sql-completion";

type WorksheetSchemaAdapter = {
  readonly namespace: SchemaNamespace | undefined;
  readonly columnFetcher: TableColumnFetcher | undefined;
  readonly getDetailState: (key: SchemaStoreKey) => ReturnType<QuerySchemaStore["getDetailState"]>;
  readonly loadDetail: (targetId: number, database: string, name: string, kind: string) => Promise<void>;
};

/**
 * Derives schema-aware completion inputs from the shared QuerySchemaStore.
 *
 * Builds a `SchemaNamespace` from already-loaded databases and objects,
 * and provides a `columnFetcher` that reads columns from the store or
 * fetches them on demand with the store's concurrency cap.
 */
export function useWorksheetSchemaAdapter(
  store: QuerySchemaStore,
  targetId: number | undefined,
  activeDatabase: string | undefined,
  loadedDatabases: readonly string[],
  loadedObjects: readonly { database: string; name: string; kind: string }[],
): WorksheetSchemaAdapter {
  const namespace = useMemo((): SchemaNamespace | undefined => {
    if (!targetId) return undefined;

    // Before a database is selected (e.g. the server returned no default),
    // only the target-scoped database-name completion is offered. Object and
    // column suggestions wait for an explicit database selection so they can
    // never come from the wrong identity.
    if (!activeDatabase) {
      return { tables: [], databases: loadedDatabases, loadedColumns: {} };
    }

    const loadedColumns: Record<string, readonly string[]> = {};

    for (const obj of loadedObjects) {
      const state = store.getDetailState({
        targetId,
        database: obj.database,
        kind: obj.kind,
        name: obj.name,
      });
      if (state.status === "ready") {
        // Key by name and by database-qualified name so dot-completion
        // resolves both `table.` and `db.table.` references.
        loadedColumns[obj.name] = state.data.columns.map((c) => c.name);
        if (obj.database !== activeDatabase) {
          loadedColumns[`${obj.database}.${obj.name}`] = state.data.columns.map((c) => c.name);
        }
      }
    }

    return {
      tables: loadedObjects.map((o) => ({
        name: o.name,
        database: o.database,
        kind: o.kind as "table" | "view",
      })),
      databases: loadedDatabases,
      loadedColumns,
    };
  }, [store, targetId, activeDatabase, loadedDatabases, loadedObjects]);

  const columnFetcher = useCallback(
    async (table: string): Promise<readonly string[]> => {
      if (!targetId || !activeDatabase) return [];

      // Resolve database-qualified name or plain name
      const obj = loadedObjects.find(
        (o) => o.name === table || `${o.database}.${o.name}` === table,
      );
      if (!obj) return [];

      const key: SchemaStoreKey = {
        targetId,
        database: obj.database,
        kind: obj.kind,
        name: obj.name,
      };

      const state = store.getDetailState(key);
      if (state.status === "ready") {
        return state.data.columns.map((c) => c.name);
      }

      // Fetch on demand — the store handles deduplication and concurrency.
      try {
        const detail = await getObjectDetails(targetId, {
          database: obj.database,
          name: obj.name,
          kind: obj.kind as "table" | "view",
        });
        store.setDetail(key, detail);
        return detail.columns.map((c) => c.name);
      } catch {
        return [];
      }
    },
    [store, targetId, activeDatabase, loadedObjects],
  );

  const loadDetail = useCallback(
    async (detailTargetId: number, database: string, name: string, kind: string) => {
      const key: SchemaStoreKey = { targetId: detailTargetId, database, kind, name };
      if (!store.acquireDetailSlot(key)) return;

      store.setDetailLoading(key);
      try {
        const detail = await getObjectDetails(detailTargetId, {
          database,
          name,
          kind: kind as "table" | "view",
        });
        store.setDetail(key, detail);
      } catch {
        store.setEmptyDetail(key);
      } finally {
        store.releaseDetailSlot(key);
      }
    },
    [store],
  );

  return { namespace, columnFetcher, getDetailState: store.getDetailState.bind(store), loadDetail };
}
