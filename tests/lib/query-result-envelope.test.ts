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
  const response: QueryExecuteResponse = {
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
  // Derived default: an aligned all-false matrix unless the test overrides
  // cellTruncated explicitly (including `undefined` for missing-matrix cases).
  if (!("cellTruncated" in overrides)) {
    response.cellTruncated = (Array.isArray(response.rows) ? response.rows : []).map(
      (row) => (Array.isArray(row) ? row : []).map(() => false),
    );
  }
  return response;
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

describe("normalizeExecuteResponse cellTruncated matrix", () => {
  it("preserves an aligned matrix verbatim, including true flags", () => {
    const envelope = normalizeExecuteResponse(
      result({ cellTruncated: [[true]] }),
    );
    expect(envelope.ok).toBe(true);
    if (envelope.ok) {
      expect(envelope.response.cellTruncated).toEqual([[true]]);
    }
  });

  it("rejects a non-empty success page with no matrix", () => {
    const envelope = normalizeExecuteResponse(
      result({ cellTruncated: undefined }),
    );
    expect(envelope.ok).toBe(false);
  });

  it("rejects a matrix whose row count does not match rows", () => {
    const envelope = normalizeExecuteResponse(
      result({ cellTruncated: [[false], [false]] }),
    );
    expect(envelope.ok).toBe(false);
  });

  it("rejects a matrix row whose width does not match columns", () => {
    const envelope = normalizeExecuteResponse(
      result({ cellTruncated: [[false, false]] }),
    );
    expect(envelope.ok).toBe(false);
  });

  it("rejects non-boolean matrix entries without coercion", () => {
    for (const bad of ["true", 1, null, "false"]) {
      const envelope = normalizeExecuteResponse(
        result({ cellTruncated: [[bad as unknown as boolean]] }),
      );
      expect(envelope.ok).toBe(false);
    }
  });

  it("rejects a non-array matrix entry row", () => {
    const envelope = normalizeExecuteResponse(
      result({ cellTruncated: ["x" as unknown as boolean[]] }),
    );
    expect(envelope.ok).toBe(false);
  });

  it("accepts a zero-row page with an absent matrix and normalizes it to empty", () => {
    const envelope = normalizeExecuteResponse(
      result({ rows: [], rowCount: 0, cellTruncated: undefined }),
    );
    expect(envelope.ok).toBe(true);
    if (envelope.ok) expect(envelope.response.cellTruncated).toEqual([]);
  });

  it("accepts a zero-row page with an empty matrix", () => {
    const envelope = normalizeExecuteResponse(
      result({ rows: [], rowCount: 0, cellTruncated: [] }),
    );
    expect(envelope.ok).toBe(true);
    if (envelope.ok) expect(envelope.response.cellTruncated).toEqual([]);
  });

  it("rejects a residual non-empty matrix on a zero-row page", () => {
    const envelope = normalizeExecuteResponse(
      result({ rows: [], rowCount: 0, cellTruncated: [[false]] }),
    );
    expect(envelope.ok).toBe(false);
  });

  it("rejects a residual non-empty matrix on a legacy rows:null zero-row page", () => {
    const envelope = normalizeExecuteResponse(
      result({
        rows: null as unknown as QueryExecuteResponse["rows"],
        rowCount: 0,
        cellTruncated: [[false]],
      }),
    );
    expect(envelope.ok).toBe(false);
  });
});

describe("normalizeExecuteResponse postgresql cell contract", () => {
  it("accepts string and null cells on a postgresql page", () => {
    const envelope = normalizeExecuteResponse(
      result({ engine: "postgresql", rows: [["7", null]], columns: [column(), column({ name: "note", nullable: true })], rowCount: 1 }),
    );
    expect(envelope.ok).toBe(true);
  });

  it.each([7, true])("rejects a non-string non-null postgresql cell (%s)", (cell) => {
    const envelope = normalizeExecuteResponse(
      result({ engine: "postgresql", rows: [[cell]], rowCount: 1 }),
    );
    expect(envelope.ok).toBe(false);
  });

  it("keeps numeric cells valid for mysql", () => {
    const envelope = normalizeExecuteResponse(result({ rows: [[7]] }));
    expect(envelope.ok).toBe(true);
  });
});
