// input: Vitest and list-page URL search-param parsers
// output: resource/audit pagination and structured-filter normalization regression tests
// pos: public parser contract tests for list-page URL state
// note: if this file changes, update this header and tests/lib/README.md
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
        environmentId: "10000000",
      }),
    );

    expect(result.environmentId).toBe(10000000);
    expect(result.environmentSlug).toBeUndefined();
  });

  it("reads both environment and environmentId when both are present", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({
        environment: "prod",
        environmentId: "10000000",
      }),
    );

    expect(result.environmentSlug).toBe("prod");
    expect(result.environmentId).toBe(10000000);
  });

  it("preserves repeated environment, owner, and label filters", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({
        environmentId: ["7", "8"],
        ownerId: "42",
        label: ["team:payments", "tier:1"],
      }),
    );

    expect(result.environmentId).toEqual([7, 8]);
    expect(result.ownerId).toBe(42);
    expect(result.label).toEqual(["team:payments", "tier:1"]);
  });

  it("rejects malformed numeric environmentId values", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({
        environmentId: "10000000x",
      }),
    );

    expect(result.environmentId).toBeUndefined();
  });

  it("rejects unsafe numeric environmentId values", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({
        environmentId: "9007199254740992",
      }),
    );

    expect(result.environmentId).toBeUndefined();
  });

  it("preserves pagination params", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({ page: "3", pageSize: "25", environment: "staging" }),
    );

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(25);
    expect(result.environmentSlug).toBe("staging");
  });

  it("defaults page to 1 and pageSize to 10", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({}),
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
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

  it("falls back safely for invalid pagination and empty search", async () => {
    const result = await parseResourceListSearchParams(
      Promise.resolve({ page: "0", pageSize: "not-a-number", q: "   " }),
    );

    expect(result).toMatchObject({ page: 1, pageSize: 10 });
    expect(result.q).toBeUndefined();
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
  it("rejects malformed numeric targetResourceId values", async () => {
    const result = await parseAuditListSearchParams(
      Promise.resolve({ targetResourceId: "9oops" }),
    );

    expect(result.targetResourceId).toBeUndefined();
  });

  it("rejects unsafe numeric targetResourceId values", async () => {
    const result = await parseAuditListSearchParams(
      Promise.resolve({ targetResourceId: "9007199254740992" }),
    );

    expect(result.targetResourceId).toBeUndefined();
  });

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

  it("defaults page to 1 and pageSize to 10", async () => {
    const result = await parseAuditListSearchParams(
      Promise.resolve({}),
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });
});
