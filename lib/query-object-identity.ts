// input: @/types/query-schema ObjectSummary
// output: stable UI identity keys incl. PostgreSQL schema-scope keys
// pos: shared identity helper for explorer tree/inspector state
// note: if this file changes, update this header and lib/README.md.
import type { ObjectSummary } from "@/types/query-schema";

/** Stable, injective UI identity for an expanded object. */
export function objectIdentityKey(
  object: Pick<ObjectSummary, "database" | "kind" | "name"> & { readonly schema?: string },
): string {
  return JSON.stringify([object.database, object.schema ?? "", object.kind, object.name]);
}

export function objectKeyBelongsToDatabase(key: string, database: string): boolean {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && parsed[0] === database;
  } catch {
    return false;
  }
}

export function objectKeyBelongsToScope(key: string, database: string, schema: string): boolean {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && parsed[0] === database && parsed[1] === schema;
  } catch {
    return false;
  }
}

/** Scope key for per-(database,schema) object listings; "" for MySQL/TiDB. */
export function schemaScopeKey(database: string, schema: string): string {
  return JSON.stringify([database, schema]);
}

export function parseSchemaScope(key: string): { readonly database: string; readonly schema: string } | null {
  try {
    const parsed: unknown = JSON.parse(key);
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
      return { database: parsed[0], schema: parsed[1] };
    }
    return null;
  } catch {
    return null;
  }
}

/** HTML id / aria-owns target that is injective over database names. */
export function schemaObjectGroupId(database: string, schema = ""): string {
  const hex = Array.from(new TextEncoder().encode(`${database}\x00${schema}`), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `schema-object-group-${hex}`;
}
