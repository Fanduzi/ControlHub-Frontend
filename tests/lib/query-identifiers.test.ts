import { describe, expect, it } from "vitest";

import { objectIdentifier, quoteQueryIdentifier } from "@/lib/query-identifiers";

describe("query identifiers", () => {
  it("quotes special identifier names", () => {
    expect(quoteQueryIdentifier("order`items")).toBe("`order``items`");
  });

  it("uses an unqualified name for active database objects", () => {
    expect(objectIdentifier({ database: "app", name: "orders", activeDatabase: "app" })).toBe("`orders`");
  });

  it("qualifies objects outside the active database", () => {
    expect(objectIdentifier({ database: "audit", name: "order items", activeDatabase: "app" })).toBe("`audit`.`order items`");
  });
});
