import type { QueryResultCellValue, QueryResultColumn } from "@/types/query-execution";
import { assertQueryResultExportable } from "@/lib/query-result-export";

function escapeCsvField(value: Exclude<QueryResultCellValue, null>): string {
  const safeValue = typeof value === "string" && /^[=+\-@]/.test(value)
    ? `'${value}`
    : String(value);
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
}

/**
 * Serializes only the current visible result page under the shared whole-page
 * export contract in `query-result-export.ts` (mirroring the backend
 * DecideCSVExport contract). Throws whenever assertQueryResultExportable
 * refuses — callers cannot reach bytes for a non-copyable, truncated, or
 * structurally corrupt page.
 */
export function serializeQueryResultCsv(
  columns: readonly QueryResultColumn[],
  rows: readonly QueryResultCellValue[][],
  cellTruncated: readonly (readonly boolean[])[] | null | undefined,
): string {
  assertQueryResultExportable(columns, rows, cellTruncated);
  return [
    columns.map((column) => escapeCsvField(column.name)).join(","),
    ...rows.map((row) =>
      row.map((cell) => escapeCsvField(cell === null ? "" : cell)).join(","),
    ),
  ].join("\r\n") + "\r\n";
}
