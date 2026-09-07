// input: @/lib/query-result-envelope
// output: Vitest tests for governed result disclosure checks
// pos: result envelope interface is the test surface
// note: if this file changes, update header and tests/lib/README.md
import { describe, expect, it } from "vitest";

import { normalizeExecuteResponse } from "@/lib/query-result-envelope";
import type { QueryExecuteResponse, QueryResultColumn } from "@/types/query-execution";

function column(overrides: Partial<QueryResultColumn> = {}): QueryResultColumn {
  return {
    name: "id",
    databaseType: "BIGINT",
    nullable: false,
    displayMode: "raw_copy_allowed",
    copyAllowed: true,
    ...overrides,
  };
}

function result(overrides: Partial<QueryExecuteResponse> = {}): QueryExecuteResponse {
  return {
    executionId: 1,
    status: "success",
    targetResourceId: 1,
    engine: "mysql",
    columns: [column()],
    rows: [[1]],
    rowCount: 1,
    truncated: false,
    durationMs: 1,
    limitApplied: 100,
    executedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("normalizeExecuteResponse", () => {
  it("accepts a well-formed raw_copy_allowed grid", () => {
    const envelope = normalizeExecuteResponse(result());
    expect(envelope.ok).toBe(true);
  });

  it("normalizes legacy rows:null with rowCount 0 to an empty grid", () => {
    const envelope = normalizeExecuteResponse(
      result({ rows: null as unknown as QueryExecuteResponse["rows"], rowCount: 0 }),
    );
    expect(envelope.ok).toBe(true);
    if (envelope.ok) expect(envelope.response.rows).toEqual([]);
  });

  it("redacts blocked cells before they reach the grid", () => {
    const envelope = normalizeExecuteResponse(
      result({
        columns: [column({ displayMode: "blocked", copyAllowed: false })],
        rows: [["secret"]],
      }),
    );
    expect(envelope.ok).toBe(true);
    if (envelope.ok) expect(envelope.response.rows).toEqual([["[blocked]"]]);
  });

  it("rejects masked_no_copy cells that are not the sentinel", () => {
    const envelope = normalizeExecuteResponse(
      result({
        columns: [column({ name: "secret", displayMode: "masked_no_copy", copyAllowed: false })],
        rows: [["plaintext"]],
      }),
    );
    expect(envelope.ok).toBe(false);
  });

  it("accepts masked_no_copy cells that are the sentinel or null", () => {
    const envelope = normalizeExecuteResponse(
      result({
        columns: [column({ name: "secret", displayMode: "masked_no_copy", copyAllowed: false })],
        rows: [["[MASKED]"], [null]],
        rowCount: 2,
      }),
    );
    expect(envelope.ok).toBe(true);
  });

  it("rejects unknown disclosure modes", () => {
    const envelope = normalizeExecuteResponse(
      result({
        columns: [column({ displayMode: "nope" as QueryResultColumn["displayMode"] })],
      }),
    );
    expect(envelope.ok).toBe(false);
  });
});
