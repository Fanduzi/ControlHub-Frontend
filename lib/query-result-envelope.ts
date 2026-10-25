import type { QueryExecuteResponse } from "@/types/query-execution";

const VALID_DISCLOSURE_MODES = new Set(["raw_copy_allowed", "masked_no_copy", "blocked"]);
const MASKED_SENTINEL = "[MASKED]";

/**
 * An execute response that passed contract validation. `cellTruncated` is
 * guaranteed present and aligned one-for-one with `rows`/`columns` (empty for
 * zero-row pages), so UI and CSV export can rely on positional flags.
 */
export type NormalizedExecuteResponse = QueryExecuteResponse & {
  cellTruncated: readonly (readonly boolean[])[];
};

export type ResultEnvelope =
  | { ok: true; response: NormalizedExecuteResponse }
  | { ok: false; error: string };

/**
 * Take a wire execute payload and return a grid-safe envelope.
 * Blocked columns, unknown disclosure modes, and malformed shapes fail closed.
 */
export function normalizeExecuteResponse(raw: QueryExecuteResponse): ResultEnvelope {
  if (!Array.isArray(raw.columns)) {
    return { ok: false, error: "Invalid response: columns is not an array" };
  }
  for (const col of raw.columns) {
    if (typeof col?.name !== "string" || col.name.length === 0) {
      return { ok: false, error: "Invalid response: column missing name" };
    }
    if (!VALID_DISCLOSURE_MODES.has(col.displayMode)) {
      return { ok: false, error: "Invalid response: column has unknown disclosure mode" };
    }
    if (typeof col.copyAllowed !== "boolean") {
      return { ok: false, error: "Invalid response: copyAllowed must be a boolean" };
    }
    if (col.displayMode === "raw_copy_allowed" && col.copyAllowed !== true) {
      return { ok: false, error: "Invalid response: raw_copy_allowed column must have copyAllowed=true" };
    }
    if (col.displayMode === "masked_no_copy" && col.copyAllowed !== false) {
      return { ok: false, error: "Invalid response: masked_no_copy column must have copyAllowed=false" };
    }
    if (col.displayMode === "blocked" && col.copyAllowed !== false) {
      return { ok: false, error: "Invalid response: blocked column must have copyAllowed=false" };
    }
  }

  if (raw.rows === null || raw.rows === undefined) {
    if (raw.status === "success" && raw.rowCount === 0) {
      if (raw.cellTruncated !== undefined && (!Array.isArray(raw.cellTruncated) || raw.cellTruncated.length !== 0)) {
        return { ok: false, error: "Invalid response: residual cellTruncated matrix on empty result" };
      }
      return { ok: true, response: { ...raw, rows: [], cellTruncated: [] } };
    }
    return { ok: false, error: "Invalid response: rows is null with non-zero rowCount" };
  }

  if (!Array.isArray(raw.rows)) {
    return { ok: false, error: "Invalid response: rows is not an array" };
  }

  if (raw.rows.length !== raw.rowCount) {
    return { ok: false, error: "Invalid response: row count mismatch" };
  }

  for (const row of raw.rows) {
    if (!Array.isArray(row)) {
      return { ok: false, error: "Invalid response: row is not an array" };
    }
    if (row.length !== raw.columns.length) {
      return { ok: false, error: "Invalid response: row width does not match column count" };
    }
    if (raw.engine === "postgresql") {
      for (const cell of row) {
        if (cell !== null && typeof cell !== "string") {
          return { ok: false, error: "Invalid response: postgresql cell is not a string or null" };
        }
      }
    }
  }

  // cellTruncated contract: every non-empty success page carries a boolean
  // matrix aligned with rows/columns; empty pages must not carry residual
  // flags. Never fabricate an all-false matrix for malformed payloads.
  // The approved zero-row compatibility contract permits the field to be
  // absent only when no rows were delivered — normalized to an empty matrix.
  const matrix = raw.cellTruncated === undefined && raw.rows.length === 0 ? [] : raw.cellTruncated;
  if (!Array.isArray(matrix)) {
    return { ok: false, error: "Invalid response: cellTruncated matrix is missing" };
  }
  if (matrix.length !== raw.rows.length) {
    return { ok: false, error: "Invalid response: cellTruncated row count mismatch" };
  }
  for (const matrixRow of matrix) {
    if (!Array.isArray(matrixRow) || matrixRow.length !== raw.columns.length) {
      return { ok: false, error: "Invalid response: cellTruncated row width mismatch" };
    }
    for (const flag of matrixRow) {
      if (typeof flag !== "boolean") {
        return { ok: false, error: "Invalid response: cellTruncated entry is not a boolean" };
      }
    }
  }

  for (let colIdx = 0; colIdx < raw.columns.length; colIdx++) {
    const col = raw.columns[colIdx];
    if (col.displayMode === "masked_no_copy") {
      for (let rowIdx = 0; rowIdx < raw.rows.length; rowIdx++) {
        const cell = raw.rows[rowIdx][colIdx];
        if (cell !== null && cell !== MASKED_SENTINEL) {
          return { ok: false, error: "Invalid response: masked_no_copy column contains non-masked value" };
        }
      }
    }
  }

  return {
    ok: true,
    response: {
      ...raw,
      cellTruncated: matrix,
      rows: raw.rows.map((row) =>
        row.map((cell, index) =>
          raw.columns[index]?.displayMode === "blocked" ? "[blocked]" : cell,
        ),
      ),
    },
  };
}
