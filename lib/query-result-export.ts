import type { QueryResultCellValue, QueryResultColumn } from "@/types/query-execution";

const REFUSAL = "Cannot export result";

/**
 * Whole-page export eligibility, mirroring the backend DecideCSVExport
 * contract: every delivered column must be raw_copy_allowed with
 * copyAllowed=true; the truncation matrix is required evidence for a
 * non-empty page (a zero-row page may carry a null/undefined or empty matrix,
 * while a residual non-empty matrix is corrupt evidence); every row must be
 * exactly column-width with JSON-safe scalar cells; and no delivered cell may
 * be truncated. There is no masked/blocked placeholder export and no
 * tolerance for missing or surplus cells — structural gaps refuse the whole
 * page rather than degrade into unchecked output.
 */
export function assertQueryResultExportable(
  columns: readonly QueryResultColumn[],
  rows: readonly QueryResultCellValue[][],
  cellTruncated: readonly (readonly boolean[])[] | null | undefined,
): void {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(`${REFUSAL}: no exportable columns`);
  }
  for (const column of columns) {
    if (column?.displayMode !== "raw_copy_allowed" || column?.copyAllowed !== true) {
      throw new Error(`${REFUSAL}: a column is not copyable`);
    }
    if (typeof column.name !== "string" || column.name.length === 0) {
      throw new Error(`${REFUSAL}: invalid column name`);
    }
  }
  if (!Array.isArray(rows)) {
    throw new Error(`${REFUSAL}: malformed result page`);
  }
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new Error(`${REFUSAL}: row width does not match the column list`);
    }
    for (const cell of row) {
      if (
        cell !== null &&
        typeof cell !== "string" &&
        (typeof cell !== "number" || !Number.isFinite(cell)) &&
        typeof cell !== "boolean"
      ) {
        throw new Error(`${REFUSAL}: cell is not a JSON-safe scalar`);
      }
    }
  }
  if (cellTruncated == null) {
    if (rows.length === 0) return;
    throw new Error(`${REFUSAL}: truncation matrix is missing`);
  }
  if (!Array.isArray(cellTruncated) || cellTruncated.length !== rows.length) {
    throw new Error(`${REFUSAL}: truncation matrix does not match the current page`);
  }
  for (const matrixRow of cellTruncated) {
    if (!Array.isArray(matrixRow) || matrixRow.length !== columns.length) {
      throw new Error(`${REFUSAL}: truncation matrix does not match the current page`);
    }
    for (const flag of matrixRow) {
      // A sparse-array hole reads as undefined and refuses the same way an
      // explicitly non-boolean element does — corrupt evidence is never
      // treated as authorized-clean.
      if (typeof flag !== "boolean") {
        throw new Error(`${REFUSAL}: truncation matrix is corrupt`);
      }
      if (flag) {
        throw new Error(`${REFUSAL}: the current page contains truncated cell values`);
      }
    }
  }
}

/**
 * Non-throwing whole-page eligibility check for the UI affordance. Shares the
 * serializer's exact contract so a restricted page can never produce a
 * download event regardless of the target-level export flag.
 */
export function isQueryResultExportable(
  columns: readonly QueryResultColumn[],
  rows: readonly QueryResultCellValue[][],
  cellTruncated: readonly (readonly boolean[])[] | null | undefined,
): boolean {
  try {
    assertQueryResultExportable(columns, rows, cellTruncated);
    return true;
  } catch {
    return false;
  }
}

/** Serialize the current authorized page without coercing delivered cell values. */
export function serializeQueryResultJson(
  columns: readonly QueryResultColumn[],
  rows: readonly QueryResultCellValue[][],
  cellTruncated: readonly (readonly boolean[])[] | null | undefined,
): string {
  assertQueryResultExportable(columns, rows, cellTruncated);
  return `${JSON.stringify({ columns: columns.map(({ name }) => name), rows }, null, 2)}\n`;
}
