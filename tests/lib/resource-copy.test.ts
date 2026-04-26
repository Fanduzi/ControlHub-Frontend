import { describe, expect, it } from "vitest";

import { getResourceSummaryKey } from "@/lib/resource-copy";

describe("getResourceSummaryKey", () => {
  it("returns null for any resource ID — no hardcoded demo-ID mappings", () => {
    expect(getResourceSummaryKey(1)).toBeNull();
    expect(getResourceSummaryKey(14)).toBeNull();
    expect(getResourceSummaryKey(22)).toBeNull();
    expect(getResourceSummaryKey(999)).toBeNull();
  });
});
