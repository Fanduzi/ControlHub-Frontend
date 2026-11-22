import type { QueryResultCellValue, QueryResultColumn } from "@/types/query-execution";

export type ResultCellPoint = { row: number; col: number };
export type ResultRange = { top: number; bottom: number; left: number; right: number };
type ResultPage = {
  columns: readonly QueryResultColumn[];
  rows: readonly (readonly QueryResultCellValue[])[];
  cellTruncated: readonly (readonly boolean[])[];
};

export function resultRangeBetween(anchor: ResultCellPoint, end: ResultCellPoint): ResultRange {
  return { top: Math.min(anchor.row, end.row), bottom: Math.max(anchor.row, end.row), left: Math.min(anchor.col, end.col), right: Math.max(anchor.col, end.col) };
}

export function isColumnCopyable(column: QueryResultColumn | undefined): boolean {
  return column?.displayMode === "raw_copy_allowed" && column.copyAllowed === true;
}

export function resultRangeCopyRefusal({ columns, rows, cellTruncated }: ResultPage, { top, bottom, left, right }: ResultRange): "disclosure" | "truncated" | "unavailable" | null {
  if (![top, bottom, left, right].every(Number.isInteger) || top < 0 || left < 0 || top > bottom || left > right || bottom >= rows.length || right >= columns.length) return "unavailable";
  for (let col = left; col <= right; col++) {
    if (!isColumnCopyable(columns[col])) return "disclosure";
  }
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      const value = rows[row]?.[col];
      if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "unavailable";
      const truncated = cellTruncated[row]?.[col];
      if (truncated === true) return "truncated";
      if (truncated !== false) return "unavailable";
    }
  }
  return null;
}

function escapeTsvField(value: QueryResultCellValue): string {
  if (value === null) return "";
  const text = typeof value === "string" && /^\s*[=+@-]/u.test(value) ? `'${value}` : String(value);
  return /["\t\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeResultRangeTsv(page: ResultPage, range: ResultRange): string | null {
  if (resultRangeCopyRefusal(page, range) !== null) return null;
  return page.rows.slice(range.top, range.bottom + 1)
    .map((row) => row.slice(range.left, range.right + 1).map(escapeTsvField).join("\t"))
    .join("\n");
}
