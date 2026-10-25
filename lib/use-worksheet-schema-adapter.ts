import { useCallback } from "react";

import { type SchemaCatalog, useSchemaCatalogVersion } from "@/lib/schema-catalog";
import type { SchemaNamespace, TableColumnFetcher } from "@/lib/query-sql-completion";

type WorksheetSchemaAdapter = {
  readonly namespace: SchemaNamespace | undefined;
  readonly columnFetcher: TableColumnFetcher | undefined;
};

/**
 * Reads completion inputs for the worksheet's current 库身份 from schema catalog.
 */
export function useWorksheetSchemaAdapter(
  catalog: SchemaCatalog,
  targetId: number | undefined,
  activeDatabase: string | undefined,
  activeSchema?: string,
  postgres = false,
): WorksheetSchemaAdapter {
  useSchemaCatalogVersion(catalog);
  const namespace = catalog.completionNamespace(targetId, activeDatabase, activeSchema, postgres);
  const columnFetcher = useCallback(
    (table: string) => catalog.columnsFor(targetId, activeDatabase, table, activeSchema, postgres),
    [catalog, targetId, activeDatabase, activeSchema, postgres],
  );
  return { namespace, columnFetcher };
}
