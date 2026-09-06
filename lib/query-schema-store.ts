// input: @/lib/schema-catalog
// output: re-exports SchemaCatalog as QuerySchemaStore for existing call sites
// pos: compatibility seam while the query workbench talks to schema catalog
// note: if this file changes, update header and lib/README.md
export {
  SchemaCatalog,
  SchemaCatalog as QuerySchemaStore,
  useSchemaCatalogVersion,
  COMPLETION_PAGE_SIZE,
} from "@/lib/schema-catalog";
export type {
  SchemaStoreKey,
  DetailState,
  SchemaCatalogFetch,
  DatabaseListing,
  ObjectListing,
} from "@/lib/schema-catalog";
