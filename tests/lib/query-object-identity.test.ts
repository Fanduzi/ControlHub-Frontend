import { describe, expect, it } from "vitest";

import {
  objectIdentityKey,
  objectKeyBelongsToDatabase,
  schemaObjectGroupId,
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
