import { describe, expect, it } from "vitest";

import {
  ALL_FILTER_VALUE,
  EMPTY_FILTERS,
  collectEngines,
  filterTargets,
  formatHostPort,
  isAllFilter,
  queryKindLabelKey,
  readinessLabelKey,
} from "@/lib/query-target-display";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";

describe("filterTargets", () => {
  it("returns all targets when no filters are set", () => {
    const targets = [
      buildQueryTarget({ resourceId: 1 }),
      buildQueryTarget({ resourceId: 2 }),
    ];

    expect(filterTargets(targets, EMPTY_FILTERS)).toHaveLength(2);
  });

  it("filters by engine (case-insensitive)", () => {
    const targets = [
      buildQueryTarget({
        resourceId: 1,
        connectionContext: { engine: "mysql", host: "h1", port: 3306 },
      }),
      buildQueryTarget({
        resourceId: 2,
        connectionContext: { engine: "redis", host: "h2", port: 6379 },
      }),
    ];

    const result = filterTargets(targets, {
      ...EMPTY_FILTERS,
      engine: "MySQL",
    });

    expect(result).toHaveLength(1);
    expect(result[0].resourceId).toBe(1);
  });

  it("filters by query kind", () => {
    const targets = [
      buildQueryTarget({
        resourceId: 1,
        capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      }),
      buildQueryTarget({
        resourceId: 2,
        capability: { queryKind: "redis", editorMode: "redis", languageLabel: "Redis command" },
      }),
    ];

    const result = filterTargets(targets, {
      ...EMPTY_FILTERS,
      queryKind: "redis",
    });

    expect(result).toHaveLength(1);
    expect(result[0].capability.queryKind).toBe("redis");
  });

  it("filters by readiness", () => {
    const targets = [
      buildQueryTarget({ resourceId: 1, readiness: "credential_required" }),
      buildQueryTarget({ resourceId: 2, readiness: "unsupported_engine" }),
    ];

    const result = filterTargets(targets, {
      ...EMPTY_FILTERS,
      readiness: "unsupported_engine",
    });

    expect(result).toHaveLength(1);
    expect(result[0].readiness).toBe("unsupported_engine");
  });

  it("filters by free-text search across name, engine, host, and owner", () => {
    const targets = [
      buildQueryTarget({
        resourceId: 1,
        displayName: "Payment MySQL Replica",
        connectionContext: { engine: "mysql", host: "payment-mysql.internal", port: 3306, owner: "Payments" },
      }),
      buildQueryTarget({
        resourceId: 2,
        displayName: "Analytics ClickHouse",
        connectionContext: { engine: "clickhouse", host: "prod-ch.internal", port: 8123, owner: "DBA Team" },
      }),
    ];

    const result = filterTargets(targets, { ...EMPTY_FILTERS, q: "payment" });

    expect(result).toHaveLength(1);
    expect(result[0].resourceId).toBe(1);
  });

  it("treats the ALL_FILTER_VALUE sentinel the same as empty (no filter)", () => {
    const targets = [
      buildQueryTarget({ resourceId: 1 }),
      buildQueryTarget({ resourceId: 2 }),
    ];

    const result = filterTargets(targets, {
      ...EMPTY_FILTERS,
      engine: ALL_FILTER_VALUE,
      queryKind: ALL_FILTER_VALUE,
      readiness: ALL_FILTER_VALUE,
    });

    expect(result).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const targets = [
      buildQueryTarget({ resourceId: 1 }),
      buildQueryTarget({ resourceId: 2 }),
    ];
    const snapshot = [...targets];

    filterTargets(targets, { ...EMPTY_FILTERS, engine: "mysql" });

    expect(targets).toEqual(snapshot);
  });
});

describe("collectEngines", () => {
  it("returns unique sorted engine strings", () => {
    const targets = [
      buildQueryTarget({ connectionContext: { engine: "redis", host: "h", port: 1 } }),
      buildQueryTarget({ connectionContext: { engine: "mysql", host: "h", port: 1 } }),
      buildQueryTarget({ connectionContext: { engine: "mysql", host: "h", port: 1 } }),
    ];

    expect(collectEngines(targets)).toEqual(["mysql", "redis"]);
  });
});

describe("formatHostPort", () => {
  it("joins host and port with a colon", () => {
    expect(formatHostPort("db.internal", 8123)).toBe("db.internal:8123");
  });
});

describe("isAllFilter", () => {
  it("is true for empty and sentinel values", () => {
    expect(isAllFilter("")).toBe(true);
    expect(isAllFilter(ALL_FILTER_VALUE)).toBe(true);
    expect(isAllFilter("mysql")).toBe(false);
  });
});

describe("label keys", () => {
  it("builds readiness label keys under the queryWorkbench namespace", () => {
    expect(readinessLabelKey("credential_required")).toBe(
      "readinessValues.credential_required",
    );
  });

  it("builds query-kind label keys under the queryWorkbench namespace", () => {
    expect(queryKindLabelKey("redis")).toBe("queryKindValues.redis");
  });
});
