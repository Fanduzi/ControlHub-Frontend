import { describe, expect, it } from "vitest";

import {
  ALL_FILTER_VALUE,
  EMPTY_FILTERS,
  collectEngines,
  credentialStateLabel,
  credentialStateLabelKey,
  describeHostPort,
  filterTargets,
  formatHostPortLabel,
  isAllFilter,
  missingFieldLabel,
  missingFieldLabelKey,
  queryKindLabelKey,
  readinessLabelKey,
} from "@/lib/query-target-display";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";

// Translator stub: returns the key so tests can prove a known value is mapped
// to an i18n key rather than leaking the raw machine string.
const keyEcho = (key: string) => key;

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

describe("describeHostPort", () => {
  it("returns a complete host:port when both are present", () => {
    expect(describeHostPort("db.internal", 8123)).toEqual({
      kind: "complete",
      value: "db.internal:8123",
    });
  });

  it("returns hostOnly when the port is missing (no degenerate :0)", () => {
    expect(describeHostPort("db.internal", 0)).toEqual({
      kind: "hostOnly",
      value: "db.internal",
    });
  });

  it("returns incomplete for a missing_connection target (empty host, port 0)", () => {
    expect(describeHostPort("", 0)).toEqual({ kind: "incomplete" });
  });

  it("returns incomplete when only a port is present (no degenerate :port)", () => {
    expect(describeHostPort("", 6379)).toEqual({ kind: "incomplete" });
  });

  it("treats a whitespace host as missing", () => {
    expect(describeHostPort("   ", 0)).toEqual({ kind: "incomplete" });
  });
});

describe("formatHostPortLabel", () => {
  it("renders host:port for complete connections", () => {
    expect(formatHostPortLabel("db.internal", 8123, "INCOMPLETE")).toBe(
      "db.internal:8123",
    );
  });

  it("renders the localized incomplete label — never :0 — for missing_connection", () => {
    expect(formatHostPortLabel("", 0, "Connection information incomplete")).toBe(
      "Connection information incomplete",
    );
    // Guard the exact regression the review flagged.
    expect(formatHostPortLabel("", 0, "Connection information incomplete")).not.toContain(":0");
    expect(formatHostPortLabel("", 6379, "Connection information incomplete")).not.toMatch(/:6379$/);
  });
});

describe("credentialStateLabel", () => {
  it("maps known credential states to i18n keys (no raw enum leak)", () => {
    expect(credentialStateLabel(keyEcho, "missing_readonly_credential")).toBe(
      "credentialStateValues.missing_readonly_credential",
    );
    expect(credentialStateLabel(keyEcho, "configured_readonly_credential")).toBe(
      "credentialStateValues.configured_readonly_credential",
    );
    expect(credentialStateLabel(keyEcho, "not_required")).toBe(
      "credentialStateValues.not_required",
    );
    expect(credentialStateLabel(keyEcho, "unknown")).toBe(
      "credentialStateValues.unknown",
    );
  });

  it("humanizes unknown values as a fallback", () => {
    expect(credentialStateLabel(keyEcho, "some_new_state")).toBe("some new state");
  });

  it("credentialStateLabelKey returns null for unknown values", () => {
    expect(credentialStateLabelKey("missing_readonly_credential")).toBe(
      "credentialStateValues.missing_readonly_credential",
    );
    expect(credentialStateLabelKey("nope")).toBeNull();
  });
});

describe("missingFieldLabel", () => {
  it("maps known missing fields to i18n keys (no raw field leak)", () => {
    expect(missingFieldLabel(keyEcho, "readonlyCredential")).toBe(
      "missingFieldValues.readonlyCredential",
    );
    expect(missingFieldLabel(keyEcho, "engine")).toBe("missingFieldValues.engine");
    expect(missingFieldLabel(keyEcho, "host")).toBe("missingFieldValues.host");
    expect(missingFieldLabel(keyEcho, "port")).toBe("missingFieldValues.port");
  });

  it("falls back to the raw field for unknown values", () => {
    expect(missingFieldLabel(keyEcho, "customField")).toBe("customField");
  });

  it("missingFieldLabelKey returns null for unknown values", () => {
    expect(missingFieldLabelKey("host")).toBe("missingFieldValues.host");
    expect(missingFieldLabelKey("customField")).toBeNull();
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
