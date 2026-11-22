import { describe, expect, it } from "vitest";

import type { QueryResultCellValue, QueryResultColumn } from "@/types/query-execution";
import {
  isQueryResultExportable,
  serializeQueryResultJson,
} from "@/lib/query-result-export";
import { serializeQueryResultCsv } from "@/lib/query-result-csv";

function col(
  name: string,
  displayMode: QueryResultColumn["displayMode"] = "raw_copy_allowed",
  copyAllowed = true,
): QueryResultColumn {
  return { name, databaseType: "VARCHAR", nullable: true, displayMode, copyAllowed };
}

describe("serializeQueryResultJson", () => {
  it("serializes columns and rows verbatim, preserving duplicate names and delivered values", () => {
    const columns = ["id", "note", "note", "n", "flag", "f", "doc"].map((name) => col(name));
    const rows: QueryResultCellValue[][] = [
      [null, "", "NULL", 42, false, "=1+1", '{"big":9007199254740993}'],
      [7, "second", "row", -0.5, true, "plain", "{}"],
    ];

    const parsed = JSON.parse(
      serializeQueryResultJson(columns, rows, rows.map((row) => row.map(() => false))),
    ) as { columns: string[]; rows: QueryResultCellValue[][] };

    expect(parsed).toEqual({ columns: ["id", "note", "note", "n", "flag", "f", "doc"], rows });
    // JSON never applies the CSV spreadsheet-formula apostrophe guard.
    expect(parsed.rows[0]![5]).toBe("=1+1");
    expect(parsed.rows[0]![0]).toBeNull();
    expect(parsed.rows[0]![1]).toBe("");
    expect(parsed.rows[0]![2]).toBe("NULL");
    expect(parsed.rows[0]![6]).toBe('{"big":9007199254740993}');
  });
});

describe("shared whole-page export gate", () => {
  const good = {
    columns: [col("id"), col("name")],
    rows: [[1, "x"]] as QueryResultCellValue[][],
    matrix: [[false, false]] as boolean[][],
  };

  const cases: Array<{
    name: string;
    columns: QueryResultColumn[];
    rows: QueryResultCellValue[][];
    matrix: (boolean | undefined)[][] | null | undefined;
  }> = [
    {
      name: "masked column",
      columns: [col("id"), col("m", "masked_no_copy", false)],
      rows: [[1, "[MASKED]"]],
      matrix: [[false, false]],
    },
    {
      name: "blocked column",
      columns: [col("id"), col("b", "blocked", false)],
      rows: [[1, "hidden"]],
      matrix: [[false, false]],
    },
    {
      name: "raw column without copy permission",
      columns: [col("id"), col("n", "raw_copy_allowed", false)],
      rows: [[1, "x"]],
      matrix: [[false, false]],
    },
    {
      name: "single truncated cell",
      columns: good.columns,
      rows: good.rows,
      matrix: [[false, true]],
    },
    {
      name: "missing matrix",
      columns: good.columns,
      rows: good.rows,
      matrix: undefined,
    },
    {
      name: "sparse matrix hole",
      columns: good.columns,
      rows: good.rows,
      matrix: [[false, undefined]],
    },
    {
      name: "row width mismatch",
      columns: good.columns,
      rows: [[1] as never],
      matrix: [[false]],
    },
    {
      name: "empty column name",
      columns: [col("id"), col("")],
      rows: [[1, "x"]],
      matrix: [[false, false]],
    },
    {
      name: "non-finite number",
      columns: good.columns,
      rows: [[1, Number.NaN] as never],
      matrix: [[false, false]],
    },
  ];

  for (const c of cases) {
    it(`refuses JSON for ${c.name}`, () => {
      expect(isQueryResultExportable(c.columns, c.rows, c.matrix as never)).toBe(false);
      expect(() => serializeQueryResultJson(c.columns, c.rows, c.matrix as never)).toThrow(
        /Cannot export result/,
      );
    });
  }

  it("CSV shares the gate, including the non-finite number refusal", () => {
    expect(() =>
      serializeQueryResultCsv(good.columns, [[1, Number.POSITIVE_INFINITY] as never], good.matrix),
    ).toThrow(/Cannot export result/);
    expect(() => serializeQueryResultCsv([col("")], [["x"]], [[false]])).toThrow(
      /Cannot export result/,
    );
    expect(() => serializeQueryResultCsv(good.columns, good.rows, good.matrix)).not.toThrow();
  });
});
