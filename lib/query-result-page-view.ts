import { isColumnCopyable } from "@/lib/query-result-range";
import type { QueryExecuteResponse } from "@/types/query-execution";

export type ResultPageSort = { column: number; direction: "ascending" | "descending" };
export type ResultPageFilter = { column: number; text: string };
type ResultPageData = Pick<QueryExecuteResponse, "columns" | "rows"> & {
  cellTruncated: readonly (readonly boolean[])[];
};

// Drivers may preserve integer or decimal values as strings. Only treat them
// as numeric when the database type explicitly says so.
const exactNumericType = /^(?:unsigned )?(?:tinyint|smallint|mediumint|int|integer|bigint|int2|int4|int8|decimal|numeric)(?:\(\d+(?:,\s*\d+)?\))?(?: unsigned)?$/i;

function compare<T extends string | number>(left: T, right: T): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function decimalKey(value: string) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const whole = match[2]!.replace(/^0+(?=\d)/, "");
  const digits = match[3] ?? "";
  let end = digits.length;
  while (end > 0 && digits[end - 1] === "0") end--;
  const fraction = digits.slice(0, end);
  return { negative: match[1] === "-" && (whole !== "0" || fraction !== ""), whole, fraction };
}

type DecimalKey = NonNullable<ReturnType<typeof decimalKey>>;

function compareDecimal(left: DecimalKey, right: DecimalKey): number {
  if (left.negative !== right.negative) return left.negative ? -1 : 1;
  const magnitude = compare(left.whole.length, right.whole.length) ||
    compare(left.whole, right.whole) || compare(left.fraction, right.fraction);
  return left.negative ? -magnitude : magnitude;
}

export function viewQueryResultPage(
  { columns, rows, cellTruncated }: ResultPageData,
  sort: ResultPageSort | null,
  filter: ResultPageFilter | null,
): Pick<ResultPageData, "rows" | "cellTruncated"> {
  const activeSort = sort && isColumnCopyable(columns[sort.column]) ? sort : null;
  const activeFilter = filter?.text && isColumnCopyable(columns[filter.column]) ? filter : null;
  if (!activeSort && !activeFilter) return { rows, cellTruncated };

  function comparableValue(row: number, column: number) {
    if (cellTruncated[row]?.[column] !== false) return null;
    const value = rows[row]?.[column];
    return typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ? value : null;
  }

  const needle = activeFilter?.text.toLowerCase() ?? "";
  const visible = rows.map((_, index) => index).filter((index) => {
    if (!activeFilter) return true;
    const value = comparableValue(index, activeFilter.column);
    return value !== null && String(value).toLowerCase().includes(needle);
  });
  if (activeSort) {
    const { column, direction } = activeSort;
    const entries = visible.map((index) => ({ index, value: comparableValue(index, column) }));
    const numberValues = entries.every(({ value }) => value === null || typeof value === "number");
    const databaseType = columns[column]?.databaseType;
    const decimalKeys = !numberValues && typeof databaseType === "string" && exactNumericType.test(databaseType.trim())
      ? entries.map(({ value }) => value === null ? null : decimalKey(String(value)))
      : null;
    const useDecimals = decimalKeys !== null && entries.every(({ value }, index) => value === null || decimalKeys[index] !== null);
    const ordered = entries.map((entry, index) => ({ ...entry, decimal: useDecimals ? decimalKeys?.[index] : null }));
    ordered.sort((left, right) => {
      if (left.value === null) return right.value === null ? 0 : 1;
      if (right.value === null) return -1;
      const order = numberValues ? compare(Number(left.value), Number(right.value))
        : left.decimal && right.decimal ? compareDecimal(left.decimal, right.decimal)
        : compare(String(left.value), String(right.value));
      return direction === "ascending" ? order : -order;
    });
    return {
      rows: ordered.map(({ index }) => rows[index]!),
      cellTruncated: ordered.map(({ index }) => cellTruncated[index]!),
    };
  }
  return { rows: visible.map((index) => rows[index]!), cellTruncated: visible.map((index) => cellTruncated[index]!) };
}
