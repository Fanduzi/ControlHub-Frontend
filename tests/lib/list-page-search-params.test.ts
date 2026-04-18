import { describe, expect, it } from "vitest";

import {
  parseResourceListSearchParams,
  parseAuditListSearchParams,
} from "@/lib/list-page-search-params";

describe("parseResourceListSearchParams", () => {
  it("reads environment param as environmentSlug, not environmentId", async () => {
    const params = parseResourceListSearchParams(
      Promise.resolve({ environment: "prod" }),
    );
    const result = await params;

    expect(result.environmentSlug).toBe("prod");
    expect(result.environmentId).toBeUndefined();
  });

  it("reads legacy environmentId param when environment slug is absent", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({
        environmentId: "10000000-0000-0000-0000-000000000001",
      }),
    );

    expect(result.environmentId).toBe("10000000-0000-0000-0000-000000000001");
    expect(result.environmentSlug).toBeUndefined();
  });

  it("reads both environment and environmentId when both are present", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({
        environment: "prod",
        environmentId: "10000000-0000-0000-0000-000000000001",
      }),
    );

    expect(result.environmentSlug).toBe("prod");
    expect(result.environmentId).toBe("10000000-0000-0000-0000-000000000001");
  });

  it("preserves pagination params", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({ page: "3", pageSize: "25", environment: "staging" }),
    );

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(25);
    expect(result.environmentSlug).toBe("staging");
  });

  it("defaults page to 1 and pageSize to 15", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({}),
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(15);
  });

  it("reads multi-select resourceType values", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({ resourceType: ["service", "host"] }),
    );

    expect(result.resourceType).toEqual(["service", "host"]);
  });

  it("reads search query param", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({ q: "orders" }),
    );

    expect(result.q).toBe("orders");
  });

  it("reads multi-select resourceSubtype values", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({ resourceSubtype: ["mysql", "clickhouse"] }),
    );

    expect(result.resourceSubtype).toEqual(["mysql", "clickhouse"]);
  });

  it("reads single resourceSubtype value as string", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({ resourceSubtype: "mysql" }),
    );

    expect(result.resourceSubtype).toBe("mysql");
  });

  it("preserves environment slug alongside multi-select filters", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({
        environment: "prod",
        resourceType: ["service", "host"],
        resourceSubtype: ["mysql", "clickhouse"],
        lifecycleStatus: ["running"],
      }),
    );

    expect(result.environmentSlug).toBe("prod");
    expect(result.resourceType).toEqual(["service", "host"]);
    expect(result.resourceSubtype).toEqual(["mysql", "clickhouse"]);
    expect(result.lifecycleStatus).toBe("running");
  });

  it("archiveFilter remains single-value", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({ archiveFilter: "includeArchived" }),
    );

    expect(result.includeArchived).toBe(true);
    expect(result.archivedOnly).toBeUndefined();
  });
});

describe("parseAuditListSearchParams", () => {
  it("reads multi-select eventType values", async () => {
    const result = await parseAuditListSearchParams(
      Promise.resolve({ eventType: ["resource.created", "resource.updated"] }),
    );

    expect(result.eventType).toEqual(["resource.created", "resource.updated"]);
  });

  it("reads multi-select result values", async () => {
    const result = await parseAuditListSearchParams(
      Promise.resolve({ result: ["success", "warning"] }),
    );

    expect(result.result).toEqual(["success", "warning"]);
  });

  it("defaults page to 1 and pageSize to 15", async () => {
    const result = await parseAuditListSearchParams(
      Promise.resolve({}),
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(15);
  });
});
