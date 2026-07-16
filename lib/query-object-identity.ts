import type { ObjectSummary } from "@/types/query-schema";

/** Stable, injective UI identity for an expanded object. */
export function objectIdentityKey(object: Pick<ObjectSummary, "database" | "kind" | "name">): string {
  return JSON.stringify([object.database, object.kind, object.name]);
}

export function objectKeyBelongsToDatabase(key: string, database: string): boolean {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && parsed[0] === database;
  } catch {
    return false;
  }
}

/** HTML id / aria-owns target that is injective over database names. */
export function schemaObjectGroupId(database: string): string {
  const hex = Array.from(new TextEncoder().encode(database), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `schema-object-group-${hex}`;
}
