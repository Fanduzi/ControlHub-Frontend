// input: @/types/query-execution
// output: grid-safe execute envelope or controlled failure
// pos: governed result disclosure checks for run / related-records rendering
// note: if this file changes, update header and lib/README.md
import type { QueryExecuteResponse } from "@/types/query-execution";

const VALID_DISCLOSURE_MODES = new Set(["raw_copy_allowed", "masked_no_copy", "blocked"]);
const MASKED_SENTINEL = "[MASKED]";

export type ResultEnvelope =
  | { ok: true; response: QueryExecuteResponse }
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
    if (col.displayMode === "blocked") {
      return { ok: false, error: "Invalid response: successful result contains blocked column" };
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
  }

  if (raw.rows === null || raw.rows === undefined) {
    if (raw.status === "success" && raw.rowCount === 0) {
      return { ok: true, response: { ...raw, rows: [] } };
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

  return { ok: true, response: raw };
}
