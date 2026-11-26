import { describe, expect, it } from "vitest";

import type { QueryResultCellValue, QueryResultColumn } from "@/types/query-execution";
import {
  isColumnCopyable,
  resultRangeBetween,
  resultRangeCopyRefusal,
  serializeResultRangeTsv,
  serializeResultRangeMarkdown,
} from "@/lib/query-result-range";

function col(
  name: string,
  displayMode: QueryResultColumn["displayMode"] = "raw_copy_allowed",
  copyAllowed = true,
): QueryResultColumn {
  return { name, databaseType: "VARCHAR", nullable: true, displayMode, copyAllowed };
}

function page(overrides: {
  columns?: QueryResultColumn[];
  rows?: QueryResultCellValue[][];
  cellTruncated?: boolean[][];
} = {}) {
  return {
    columns: overrides.columns ?? [col("a"), col("b"), col("c")],
    rows: overrides.rows ?? [["x1", "y1", "z1"], ["x2", "y2", "z2"]],
    cellTruncated: overrides.cellTruncated ?? [[false, false, false], [false, false, false]],
  };
}

describe("resultRangeBetween", () => {
  it("normalizes reversed corners into one rectangle", () => {
    expect(resultRangeBetween({ row: 2, col: 3 }, { row: 0, col: 1 })).toEqual({
      top: 0,
      bottom: 2,
      left: 1,
      right: 3,
    });
  });
});

describe("isColumnCopyable", () => {
  it("requires both raw display and explicit copy permission", () => {
    expect(isColumnCopyable(col("a"))).toBe(true);
    expect(isColumnCopyable(col("a", "masked_no_copy", false))).toBe(false);
    expect(isColumnCopyable(col("a", "raw_copy_allowed", false))).toBe(false);
    expect(isColumnCopyable(col("a", "blocked", false))).toBe(false);
    expect(isColumnCopyable(undefined)).toBe(false);
  });
});

describe("resultRangeCopyRefusal", () => {
  it("allows a clean rectangle even when an unselected cell is restricted", () => {
    const p = page({
      cellTruncated: [[false, false, true], [false, false, false]],
    });
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 1, left: 0, right: 1 })).toBeNull();
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 0, left: 0, right: 0 })).toBeNull();
  });

  it("refuses disclosure when any column in range is not copyable", () => {
    const p = page({ columns: [col("a"), col("s", "masked_no_copy", false), col("c")] });
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 0, left: 0, right: 1 })).toBe("disclosure");
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 0, left: 1, right: 1 })).toBe("disclosure");
  });

  it("refuses disclosure on inconsistent raw column without copy permission", () => {
    const p = page({ columns: [col("a", "raw_copy_allowed", false), col("b")] });
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 0, left: 0, right: 1 })).toBe("disclosure");
  });

  it("refuses a flagged truncated cell inside the rectangle", () => {
    const p = page({ cellTruncated: [[false, true, false], [false, false, false]] });
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 0, left: 0, right: 2 })).toBe("truncated");
  });

  it("fails closed when the matrix entry is missing or non-boolean", () => {
    const p = page({ cellTruncated: [[false], [false, false, false]] });
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 0, left: 0, right: 1 })).toBe("unavailable");
  });

  it("rejects out-of-bounds, inverted, and non-integer rectangles", () => {
    const p = page();
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 2, left: 0, right: 0 })).toBe("unavailable");
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 0, left: 0, right: 3 })).toBe("unavailable");
    expect(resultRangeCopyRefusal(p, { top: 1, bottom: 0, left: 0, right: 0 })).toBe("unavailable");
    expect(resultRangeCopyRefusal(p, { top: -1, bottom: 0, left: 0, right: 0 })).toBe("unavailable");
    expect(resultRangeCopyRefusal(p, { top: 0.5, bottom: 1, left: 0, right: 0 })).toBe("unavailable");
  });

  it("rejects cells whose delivered value is not JSON-scalar", () => {
    const p = page({ rows: [[{ nested: true } as unknown as string, "y1", "z1"], ["x2", "y2", "z2"]] });
    expect(resultRangeCopyRefusal(p, { top: 0, bottom: 0, left: 0, right: 0 })).toBe("unavailable");
  });
});

describe("serializeResultRangeMarkdown", () => {
  it("adds structural headers, keeps the first selected row, and escapes literal content", () => {
    const p = page({ rows: [["not selected", "a|b\\c", "line1\r\nline2\n<em>*x*</em>"], ["not selected", null, ""]] });
    expect(serializeResultRangeMarkdown(p, { top: 0, bottom: 1, left: 1, right: 2 })).toBe(
      "| 1 | 2 |\n| --- | --- |\n| ` a\\|b\\c ` | ` line1 `<br>` line2 `<br>` <em>*x*</em> ` |\n|  |  |",
    );
  });

  it("keeps renderer autolinks, backticks, and whitespace literal", () => {
    const p = page({ rows: [["www.example.com", "team@example.com", "`a``b`"], ["https://example.com", "  edge  ", "  "]] });
    expect(serializeResultRangeMarkdown(p, { top: 0, bottom: 1, left: 0, right: 2 })).toBe(
      "| 1 | 2 | 3 |\n| --- | --- | --- |\n| ` www.example.com ` | ` team@example.com ` | ``` `a``b` ``` |\n| ` https://example.com ` | `   edge   ` | `  ` |",
    );
  });

  it("refuses hidden, masked, copy-denied, truncated, or unflagged cells", () => {
    const range = { top: 0, bottom: 0, left: 0, right: 2 };
    const pages = [
      { ...page(), hiddenColumns: new Set([1]) },
      page({ columns: [col("a"), col("b", "masked_no_copy", false), col("c")] }),
      page({ columns: [col("a"), col("b", "raw_copy_allowed", false), col("c")] }),
      page({ cellTruncated: [[false, true, false]] }),
      page({ cellTruncated: [[false]] }),
    ];
    for (const p of pages) expect(serializeResultRangeMarkdown(p, range)).toBeNull();
  });
});

describe("serializeResultRangeTsv", () => {
  it("emits row-major TSV without headers", () => {
    const p = page();
    expect(serializeResultRangeTsv(p, { top: 0, bottom: 1, left: 0, right: 1 })).toBe("x1\ty1\nx2\ty2");
  });

  it("emits empty fields for both SQL NULL and empty text", () => {
    const p = page({ rows: [[null, "", "z1"], ["x2", "y2", "z2"]] });
    expect(serializeResultRangeTsv(p, { top: 0, bottom: 0, left: 0, right: 1 })).toBe("\t");
  });

  it("keeps numeric values verbatim, including negatives", () => {
    const p = page({ rows: [[-7, 1.5, true], ["x2", "y2", "z2"]] });
    expect(serializeResultRangeTsv(p, { top: 0, bottom: 0, left: 0, right: 2 })).toBe("-7\t1.5\ttrue");
  });

  it("quotes fields containing tabs, newlines, or quotes", () => {
    const p = page({ rows: [["a\tb", 'x"y', "l1\nl2"], ["x2", "y2", "z2"]] });
    expect(serializeResultRangeTsv(p, { top: 0, bottom: 0, left: 0, right: 2 })).toBe('"a\tb"\t"x""y"\t"l1\nl2"');
  });

  it("prefixes formula-like strings with an apostrophe", () => {
    const p = page({ rows: [[" =1+1", "=cmd", "plain"], ["x2", "y2", "z2"]] });
    expect(serializeResultRangeTsv(p, { top: 0, bottom: 0, left: 0, right: 2 })).toBe("' =1+1\t'=cmd\tplain");
  });

  it("returns null when the rectangle is refused", () => {
    const p = page({ cellTruncated: [[true, false, false], [false, false, false]] });
    expect(serializeResultRangeTsv(p, { top: 0, bottom: 0, left: 0, right: 0 })).toBeNull();
    expect(serializeResultRangeTsv(p, { top: 0, bottom: 0, left: 1, right: 1 })).toBe("y1");
  });
});
