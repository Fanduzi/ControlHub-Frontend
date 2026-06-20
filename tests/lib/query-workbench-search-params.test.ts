import { describe, expect, it } from "vitest";

import { parseQueryWorkbenchSearchParams } from "@/lib/query-workbench-search-params";
import { EMPTY_FILTERS } from "@/lib/query-target-display";

describe("parseQueryWorkbenchSearchParams", () => {
  it("returns empty filters when no params are present", async () => {
    const result = await parseQueryWorkbenchSearchParams(
      Promise.resolve({}),
    );

    expect(result).toEqual(EMPTY_FILTERS);
  });

  it("reads single-value params and trims whitespace", async () => {
    const result = await parseQueryWorkbenchSearchParams(
      Promise.resolve({
        q: "  redis  ",
        engine: "mysql",
        queryKind: "sql",
        readiness: "credential_required",
      }),
    );

    expect(result).toEqual({
      q: "redis",
      engine: "mysql",
      queryKind: "sql",
      readiness: "credential_required",
    });
  });

  it("uses the first value when a param is repeated", async () => {
    const result = await parseQueryWorkbenchSearchParams(
      Promise.resolve({ engine: ["mysql", "redis"] }),
    );

    expect(result.engine).toBe("mysql");
  });
});
