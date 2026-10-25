import { describe, expect, it } from "vitest";

import {
  objectIdentityKey,
  objectKeyBelongsToDatabase,
  parseSchemaScope,
  schemaObjectGroupId,
  schemaScopeKey,
} from "@/lib/query-object-identity";

describe("query-object-identity", () => {
  it("keeps database/object keys injective across colon-containing database names", () => {
    const nested = objectIdentityKey({ database: "a:b", kind: "table", name: "x" });
    const plain = objectIdentityKey({ database: "a", kind: "table", name: "b" });
    expect(nested).not.toBe(plain);
    expect(objectKeyBelongsToDatabase(nested, "a:b")).toBe(true);
    expect(objectKeyBelongsToDatabase(nested, "a")).toBe(false);
    expect(objectKeyBelongsToDatabase(plain, "a")).toBe(true);
    expect(objectKeyBelongsToDatabase(plain, "a:b")).toBe(false);
  });

  it("keeps schema object group ids injective for percent-encoded collisions", () => {
    expect(schemaObjectGroupId("db a")).not.toBe(schemaObjectGroupId("db_20a"));
    expect(schemaObjectGroupId("db a")).toMatch(/^schema-object-group-[0-9a-f]+$/);
  });
});

describe("PostgreSQL scope keys", () => {
  it("schemaScopeKey round-trips through parseSchemaScope", () => {
    const key = schemaScopeKey("lab db", "e2e.alt");
    expect(parseSchemaScope(key)).toEqual({ database: "lab db", schema: "e2e.alt" });
  });

  it("schemaScopeKey stays injective when the pair boundary is ambiguous", () => {
    expect(schemaScopeKey("a", "b:c")).not.toBe(schemaScopeKey("a:b", "c"));
    expect(schemaScopeKey("a", "")).not.toBe(schemaScopeKey("a\"", ""));
  });

  it("parseSchemaScope rejects malformed keys without throwing", () => {
    expect(parseSchemaScope("not-json")).toBeNull();
    expect(parseSchemaScope(JSON.stringify(["a"]))).toBeNull();
    expect(parseSchemaScope(JSON.stringify([1, "s"]))).toBeNull();
  });

  it("schemaObjectGroupId stays injective across (database, schema) pairs", () => {
    expect(schemaObjectGroupId("db", "e2e")).not.toBe(schemaObjectGroupId("db", "e2e_alt"));
    expect(schemaObjectGroupId("db")).not.toBe(schemaObjectGroupId("db", "e2e"));
    expect(schemaObjectGroupId("db", "e2e")).toBe(schemaObjectGroupId("db", "e2e"));
  });
});
