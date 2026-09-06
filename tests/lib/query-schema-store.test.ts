// input: @/lib/query-schema-store, @/lib/schema-catalog
// output: Vitest test that QuerySchemaStore is SchemaCatalog
// pos: compatibility export while call sites migrate
// note: if this file changes, update header and tests/lib/README.md
import { describe, expect, it } from "vitest";

import { SchemaCatalog } from "@/lib/schema-catalog";
import { QuerySchemaStore } from "@/lib/query-schema-store";

describe("QuerySchemaStore compatibility export", () => {
  it("is SchemaCatalog", () => {
    expect(QuerySchemaStore).toBe(SchemaCatalog);
  });
});
