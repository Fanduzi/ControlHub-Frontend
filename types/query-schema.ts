import type { PageInfo } from "@/types/resource";

/**
 * Schema wire types matching backend OpenAPI for query-targets schema endpoints.
 *
 * These types are frozen wire contracts — do not add fields, rename, or change
 * semantics without updating the backend OpenAPI spec first.
 */

/** Object kind discriminator for tables and views. */
export type ObjectKind = "table" | "view";

/** Summary of a database within a query target. */
export type DatabaseSummary = {
  readonly name: string;
  readonly isDefault: boolean;
};

/** Summary of a schema object (table or view) within a database. */
export type ObjectSummary = {
  readonly database: string;
  readonly name: string;
  readonly kind: ObjectKind;
};

/** Column metadata for a schema object. */
export type ColumnDetail = {
  readonly name: string;
  readonly databaseType: string;
  readonly ordinalPosition: number;
  readonly nullable: boolean;
  readonly primaryKey: boolean;
  readonly autoIncrement: boolean;
};

/** Index metadata for a schema object. */
export type IndexDetail = {
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique: boolean;
  readonly primary: boolean;
};

/** Foreign key metadata for a schema object. */
export type ForeignKeyDetail = {
  readonly name: string;
  readonly columns: readonly string[];
  readonly referencedDatabase: string;
  readonly referencedObject: string;
  readonly referencedColumns: readonly string[];
  readonly onUpdate: string;
  readonly onDelete: string;
};

/** Truncation flags indicating if metadata was truncated. */
export type TruncationFlags = {
  readonly columns: boolean;
  readonly indexes: boolean;
  readonly foreignKeys: boolean;
};

/** Response envelope for `GET /query-targets/{id}/schema/databases`. */
export type DatabaseListResponse = {
  readonly targetResourceId: number;
  readonly defaultDatabase: string | null;
  readonly items: readonly DatabaseSummary[];
  readonly pageInfo: PageInfo;
};

/** Response envelope for `GET /query-targets/{id}/schema/objects`. */
export type ObjectListResponse = {
  readonly targetResourceId: number;
  readonly database: string;
  readonly items: readonly ObjectSummary[];
  readonly pageInfo: PageInfo;
};

/** Response envelope for `GET /query-targets/{id}/schema/object-details`. */
export type ObjectDetailResponse = {
  readonly targetResourceId: number;
  readonly database: string;
  readonly name: string;
  readonly kind: ObjectKind;
  readonly columns: readonly ColumnDetail[];
  readonly indexes: readonly IndexDetail[];
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly truncated: TruncationFlags;
};

/** Query parameters for schema database list. */
export type SchemaDatabaseListParams = {
  readonly page?: number;
  readonly pageSize?: number;
  readonly signal?: AbortSignal;
};

/** Query parameters for schema object list. */
export type SchemaObjectListParams = {
  readonly database: string;
  readonly kind?: ObjectKind;
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly signal?: AbortSignal;
};

/** Query parameters for schema object details. */
export type SchemaObjectDetailParams = {
  readonly database: string;
  readonly name: string;
  readonly kind?: ObjectKind;
  readonly signal?: AbortSignal;
};

/** Response envelope for `GET /query-targets/{id}/schema/table-definition`. */
export type TableDefinitionResponse = {
  readonly targetResourceId: number;
  readonly database: string;
  readonly name: string;
  readonly kind: "table";
  readonly dialect: "mysql";
  readonly definition: string;
  readonly truncated: boolean;
};

/** Query parameters for table definition. */
export type TableDefinitionParams = {
  readonly database: string;
  readonly name: string;
  readonly signal?: AbortSignal;
};

/** Maximum number of nodes in a relationship map response. */
export const RELATIONSHIP_MAP_MAX_NODES = 40

/** Maximum number of edges in a relationship map response. */
export const RELATIONSHIP_MAP_MAX_EDGES = 80

/** Node in a relationship map. ID is an opaque request-local token. */
export type RelationshipMapNode = {
  readonly id: string;
  readonly database: string;
  readonly name: string;
  readonly kind: "table";
  readonly role: "root" | "related";
};

/** Edge in a relationship map. ID is an opaque request-local token. */
export type RelationshipMapEdge = {
  readonly id: string;
  readonly direction: "inbound" | "outbound";
  readonly sourceId: string;
  readonly targetId: string;
  readonly columns: readonly string[];
  readonly referencedColumns: readonly string[];
  readonly onUpdate: string;
  readonly onDelete: string;
};

/** Response envelope for `GET /query-targets/{id}/schema/relationship-map`. */
export type RelationshipMapResponse = {
  readonly targetResourceId: number;
  readonly root: RelationshipMapNode;
  readonly nodes: readonly RelationshipMapNode[];
  readonly edges: readonly RelationshipMapEdge[];
  readonly truncated: boolean;
};

/** Query parameters for relationship map. */
export type RelationshipMapParams = {
  readonly database: string;
  readonly name: string;
  readonly refresh?: boolean;
  readonly signal?: AbortSignal;
};
