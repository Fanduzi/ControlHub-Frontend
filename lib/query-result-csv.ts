// input: Query result columns, visible result rows, and server-owned disclosure metadata
// output: RFC-4180 CSV with disclosure-safe field values and spreadsheet-formula neutralization
// pos: pure current-result CSV serialization boundary
// note: if this file changes, update this header and lib/README.md
import type { QueryResultCellValue, QueryResultColumn } from "@/types/query-execution";

function escapeCsvField(value: string): string {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
}

function csvValue(column: QueryResultColumn | undefined, value: QueryResultCellValue): string {
  if (column?.displayMode === "raw_copy_allowed" && column.copyAllowed === true) {
    return value === null ? "" : String(value);
  }
  return column?.displayMode === "masked_no_copy" && column.copyAllowed === false
    ? "[masked]"
    : "[blocked]";
}

/** Serializes only the current visible result page under its disclosure policy. */
export function serializeQueryResultCsv(
  columns: readonly QueryResultColumn[],
  rows: readonly QueryResultCellValue[][],
): string {
  return [
    columns.map((column) => escapeCsvField(column.name)).join(","),
    ...rows.map((row) =>
      columns.map((column, index) => escapeCsvField(csvValue(column, row[index] ?? null))).join(","),
    ),
  ].join("\r\n") + "\r\n";
}
