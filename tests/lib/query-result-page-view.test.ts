import { describe, expect, it } from "vitest";

import { viewQueryResultPage } from "@/lib/query-result-page-view";
import type { QueryResultCellValue, QueryResultColumn } from "@/types/query-execution";

function col(
  name: string,
  databaseType = "VARCHAR",
  displayMode: QueryResultColumn["displayMode"] = "raw_copy_allowed",
  copyAllowed = true,
): QueryResultColumn {
  return { name, databaseType, nullable: true, displayMode, copyAllowed };
}

function page(
  columns: QueryResultColumn[],
  rows: QueryResultCellValue[][],
  cellTruncated?: readonly (readonly boolean[])[],
) {
  return {
    columns,
    rows,
    cellTruncated: cellTruncated ?? rows.map((row) => row.map(() => false)),
  };
}

const firstCol = (rows: readonly (readonly QueryResultCellValue[])[]) =>
  rows.map((row) => row[0]);

describe("viewQueryResultPage sorting", () => {
  it("sorts BIGINT UNSIGNED wire strings by exact decimal order, not float precision", () => {
    const data = page(
      [col("n", "BIGINT UNSIGNED")],
      [["9007199254740993"], ["9007199254740992"], ["10"], ["2"]],
    );
    const view = viewQueryResultPage(data, { column: 0, direction: "ascending" }, null);
    expect(firstCol(view.rows)).toEqual(["2", "10", "9007199254740992", "9007199254740993"]);
  });

  it("sorts DECIMAL wire strings exactly: negatives before positives, sub-float tails ordered", () => {
    const data = page(
      [col("n", "DECIMAL(38,18)")],
      [["1.000000000000000002"], ["-2"], ["1.000000000000000001"], ["-10"]],
    );
    const view = viewQueryResultPage(data, { column: 0, direction: "ascending" }, null);
    expect(firstCol(view.rows)).toEqual([
      "-10",
      "-2",
      "1.000000000000000001",
      "1.000000000000000002",
    ]);
  });

  it("sorts VARCHAR numerals as text by code units", () => {
    const data = page([col("v")], [["2"], ["10"]]);
    const view = viewQueryResultPage(data, { column: 0, direction: "ascending" }, null);
    expect(firstCol(view.rows)).toEqual(["10", "2"]);
  });

  it.each([undefined, 123])("sorts as text when database type metadata is unavailable (%s)", (databaseType) => {
    const legacyColumn = { ...col("v"), databaseType } as unknown as QueryResultColumn;
    const data = page([legacyColumn], [["2"], ["10"]]);
    const view = viewQueryResultPage(data, { column: 0, direction: "ascending" }, null);
    expect(firstCol(view.rows)).toEqual(["10", "2"]);
  });

  it("sorts numbers numerically and keeps backend order for equal values", () => {
    const data = page(
      [col("n", "INT"), col("tag")],
      [[2, "first"], [10, "second"], [2, "third"], [1, "fourth"]],
    );
    const view = viewQueryResultPage(data, { column: 0, direction: "ascending" }, null);
    expect(view.rows.map((row) => row[1])).toEqual(["fourth", "first", "third", "second"]);
  });

  it("sends NULL and truncated cells last in both directions, keeping their delivered order", () => {
    const rows: QueryResultCellValue[][] = [["b"], [null], ["a"], ["z"]];
    const data = page(
      [col("v")],
      rows,
      [[false], [false], [true], [false]],
    );
    const asc = viewQueryResultPage(data, { column: 0, direction: "ascending" }, null);
    expect(firstCol(asc.rows)).toEqual(["b", "z", null, "a"]);
    expect(asc.cellTruncated.map((r) => r[0])).toEqual([false, false, false, true]);
    const desc = viewQueryResultPage(data, { column: 0, direction: "descending" }, null);
    expect(firstCol(desc.rows)).toEqual(["z", "b", null, "a"]);
    // The truncated row's flag travels with the row, not the position.
    expect(desc.cellTruncated.map((r) => r[0])).toEqual([false, false, false, true]);
  });
});

describe("viewQueryResultPage filtering", () => {
  it("matches a case-insensitive substring against the literal cell text", () => {
    const data = page(
      [col("v")],
      [["Alpha"], ["BETA"], ["alphabet"], ["other"]],
    );
    const view = viewQueryResultPage(data, null, { column: 0, text: "ALP" });
    expect(firstCol(view.rows)).toEqual(["Alpha", "alphabet"]);
  });

  it("never matches truncated prefix cells, NULLs, or rows whose flag is missing", () => {
    const data = page(
      [col("v")],
      [["needle-truncated"], [null], ["needle"], ["needle-missing"]],
      [[true], [false], [false], []],
    );
    const view = viewQueryResultPage(data, null, { column: 0, text: "needle" });
    expect(firstCol(view.rows)).toEqual(["needle"]);
  });

  it("moves per-row truncation flags on other columns with the filtered row", () => {
    const data = page(
      [col("v"), col("note")],
      [["keep", "x"], ["drop", "y"], ["keep2", "z"]],
      [[false, true], [false, false], [false, false]],
    );
    const view = viewQueryResultPage(data, null, { column: 0, text: "keep" });
    expect(firstCol(view.rows)).toEqual(["keep", "keep2"]);
    expect(view.cellTruncated.map((r) => r[1])).toEqual([true, false]);
  });
});

describe("viewQueryResultPage disclosure boundaries", () => {
  it("ignores sort and filter on masked or copy-denied columns", () => {
    const rows: QueryResultCellValue[][] = [["secret-b"], ["secret-a"]];
    const masked = page([col("v", "VARCHAR", "masked_no_copy")], rows);
    expect(viewQueryResultPage(masked, { column: 0, direction: "ascending" }, { column: 0, text: "a" }).rows)
      .toBe(masked.rows);
    const denied = page([col("v", "VARCHAR", "raw_copy_allowed", false)], rows);
    const view = viewQueryResultPage(denied, { column: 0, direction: "descending" }, { column: 0, text: "b" });
    expect(view.rows).toBe(denied.rows);
    expect(view.cellTruncated).toBe(denied.cellTruncated);
  });

  it("returns the delivered arrays untouched when no view is active", () => {
    const data = page([col("v")], [["a"], ["b"]]);
    const view = viewQueryResultPage(data, null, { column: 0, text: "" });
    expect(view.rows).toBe(data.rows);
    expect(view.cellTruncated).toBe(data.cellTruncated);
  });

  it("does not mutate the delivered rows or flag matrix", () => {
    const rows: QueryResultCellValue[][] = [["b"], ["a"]];
    const flags = [[false], [false]];
    const data = page([col("v")], rows, flags);
    const view = viewQueryResultPage(data, { column: 0, direction: "ascending" }, null);
    expect(firstCol(view.rows)).toEqual(["a", "b"]);
    expect(rows).toEqual([["b"], ["a"]]);
    expect(flags).toEqual([[false], [false]]);
  });
});
