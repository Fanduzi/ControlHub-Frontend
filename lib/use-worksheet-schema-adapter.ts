// input: @/lib/schema-catalog, @/lib/query-sql-completion
// output: React adapter over SchemaCatalog for worksheet SQL completion
// pos: thin subscription; catalog owns lists, details, and namespace
// note: if this file changes, update header and lib/README.md
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
): WorksheetSchemaAdapter {
  useSchemaCatalogVersion(catalog);
  const namespace = catalog.completionNamespace(targetId, activeDatabase);
  const columnFetcher = useCallback(
    (table: string) => catalog.columnsFor(targetId, activeDatabase, table),
    [catalog, targetId, activeDatabase],
  );
  return { namespace, columnFetcher };
}
