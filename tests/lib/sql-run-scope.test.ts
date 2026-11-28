import { describe, expect, it } from "vitest";
import { EditorSelection } from "@codemirror/state";

import {
  resolveWorksheetRunScope,
  selectedSqlBatchStatements,
  sqlStatementAtPosition,
  sqlStatementRanges,
  sqlWorksheetState,
} from "@/lib/sql-run-scope";

function scoped(doc: string, engine = "mysql", anchor?: number, head?: number) {
  const base = sqlWorksheetState(doc, engine);
  const sel =
    anchor === undefined
      ? base.selection
      : EditorSelection.create([EditorSelection.range(anchor, head ?? anchor)]);
  return resolveWorksheetRunScope(
    base.update({ selection: sel }).state,
    engine,
  );
}

describe("selectedSqlBatchStatements", () => {
  function batch(doc: string, from = 0, to = doc.length) {
    const base = sqlWorksheetState(doc, "mysql");
    return selectedSqlBatchStatements(base.update({ selection: { anchor: from, head: to } }).state, "mysql");
  }

  it("uses full-editor boundaries and retains comments and semicolons inside quoted values", () => {
    const first = "-- first; step\nSELECT 'a;b';";
    const second = "/* second; step */ SELECT 'c\\'d;e';";
    const selected = `${first}\n${second}`;
    const preceding = "SELECT 'outside';\n";
    expect(batch(preceding + selected + "\nSELECT 9;", preceding.length, preceding.length + selected.length)).toEqual([first, second]);
  });

  it.each([
    "SELECT 1;", "SELECT 1; SELECT 2", "SELECT 1;; SELECT 2;",
    "SELECT 1; SELECT 'incomplete;", "SELECT 1; SELECT 2; /* unterminated",
    "SELECT 1; /*! SELECT 2 */; SELECT 3;", "DELIMITER //\nSELECT 1//; SELECT 2;",
    "SELECT 1; SELECT 2; SELECT 3; SELECT 4; SELECT 5; SELECT 6;",
    `SELECT '${"中".repeat(5500)}'; SELECT 2;`,
  ])("refuses ambiguous or out-of-budget selection %# without yielding a prefix", (doc) => {
    expect(batch(doc)).toBeNull();
  });

  it("keeps PostgreSQL dollar strings, casts and nested comments intact", () => {
    const first = "SELECT $tag$a;b$tag$::text;";
    const second = "/* outer /* inner; */ comment */ SELECT 2;";
    const doc = `${first}\n${second}`;
    const state = sqlWorksheetState(doc, "postgresql").update({ selection: { anchor: 0, head: doc.length } }).state;
    expect(selectedSqlBatchStatements(state, "postgresql")).toEqual([first, second]);
  });

  it("keeps ClickHouse backtick identifiers and escaped strings intact", () => {
    const first = "SELECT `request;id` FROM events;";
    const second = String.raw`SELECT request_id FROM events WHERE label = 'test\';value';`;
    const doc = `${first}\n${second}`;
    const state = sqlWorksheetState(doc, "clickhouse").update({ selection: { anchor: 0, head: doc.length } }).state;
    expect(selectedSqlBatchStatements(state, "clickhouse")).toEqual([first, second]);
  });

  it("fails closed for ClickHouse-only quoting, ambiguous comments and statements over its byte cap", () => {
    for (const doc of ["# SELECT 1; SELECT 2;", "// SELECT 1; SELECT 2;", "/* SELECT 1; */ SELECT 2; SELECT 3;", "SELECT $tag$one;two$tag$; SELECT 2;", `SELECT '${"界".repeat(2730)}'; SELECT 2;`]) {
      const state = sqlWorksheetState(doc, "clickhouse").update({ selection: { anchor: doc.indexOf("SELECT"), head: doc.length } }).state;
      expect(selectedSqlBatchStatements(state, "clickhouse")).toBeNull();
    }
  });

  it("refuses selection boundaries inside a statement or comment", () => {
    const doc = "SELECT 0; /* SELECT 1; SELECT 2; */ SELECT 3; SELECT 4;";
    expect(batch(doc, doc.indexOf("SELECT 1"))).toBeNull();
    expect(batch(doc, 2)).toBeNull();
    expect(batch(doc, 0, doc.length - 1)).toBeNull();
    expect(batch(doc, 0, 0)).toBeNull();
  });
});

describe("sqlStatementRanges (lang-sql splitter)", () => {
  const ranges = (doc: string, engine = "mysql") => {
    const state = sqlWorksheetState(doc, engine);
    return sqlStatementRanges(state).map((r) => ({
      ...r,
      text: state.sliceDoc(r.from, r.to),
    }));
  };

  it("splits plain statements including their terminator", () => {
    expect(ranges("SELECT 1;\nSELECT 2")).toEqual([
      { from: 0, to: 9, text: "SELECT 1;" },
      { from: 10, to: 18, text: "SELECT 2" },
    ]);
  });

  it("keeps a semicolon inside a single-quoted string (mysql)", () => {
    const list = ranges("SELECT 'a;b'; SELECT 2");
    expect(list).toHaveLength(2);
    expect(list[0]!.text).toBe("SELECT 'a;b';");
  });

  it("keeps a semicolon inside a double-quoted string (mysql)", () => {
    const list = ranges('SELECT "a;b"; SELECT 2');
    expect(list).toHaveLength(2);
  });

  it("keeps a semicolon inside a doubled-quote string", () => {
    // WHY: 'a'';b' tokenizes as 'a' then ';b' — the semicolon is quoted either way.
    const list = ranges("SELECT 'a'';b'; SELECT 2");
    expect(list).toHaveLength(2);
    expect(list[0]!.text).toBe("SELECT 'a'';b';");
  });

  it("keeps a semicolon after a MySQL backslash-escaped quote inside the string", () => {
    // WHY: real MySQL treats \\' as an escaped quote, so the ; lives inside
    // the string literal and must not split the statement. Without
    // backslashEscapes the tokenizer would end the string at \' and the
    // following ; would look like a separator.
    const list = ranges("SELECT 'a\\';b'; SELECT 2");
    expect(list).toHaveLength(2);
    expect(list[0]!.text).toBe("SELECT 'a\\';b';");
    expect(list[1]!.text).toBe("SELECT 2");
  });

  it("keeps a semicolon inside a backtick identifier", () => {
    const list = ranges("SELECT `a;b` FROM t; SELECT 2");
    expect(list).toHaveLength(2);
    expect(list[0]!.text).toBe("SELECT `a;b` FROM t;");
  });

  it("ignores semicolons inside -- line comments (mysql requires the space)", () => {
    const list = ranges("SELECT 1; -- x;y\nSELECT 2");
    expect(list).toHaveLength(2);
    expect(list[1]!.text).toBe("SELECT 2");
  });

  it("ignores semicolons inside # comments for mysql", () => {
    const list = ranges("SELECT 1; # x;y\nSELECT 2");
    expect(list).toHaveLength(2);
    expect(list[1]!.text).toBe("SELECT 2");
  });

  it("treats --x without a space as real tokens for mysql (space required)", () => {
    // WHY: the MySQL dialect requires a space after --; --x;y is an operator
    // run, so the ; is a genuine separator. Two statements is the honest read.
    const list = ranges("SELECT 1; --x;y\nSELECT 2");
    expect(list).toHaveLength(3);
    expect(list[2]!.text).toBe("y\nSELECT 2");
  });

  it("ignores semicolons inside /* */ comments", () => {
    const list = ranges("SELECT 1 /* ; */; SELECT 2");
    expect(list).toHaveLength(2);
    expect(list[0]!.text).toBe("SELECT 1 /* ; */;");
  });

  it("keeps $$ dollar-quoted bodies intact for postgresql", () => {
    const list = ranges("SELECT $$a;b$$; SELECT 2", "postgresql");
    expect(list).toHaveLength(2);
    expect(list[0]!.text).toBe("SELECT $$a;b$$;");
  });

  it("keeps $tag$ dollar-quoted bodies intact for postgresql", () => {
    const list = ranges("SELECT $body$a;b$body$; SELECT 2", "postgresql");
    expect(list).toHaveLength(2);
    expect(list[0]!.text).toBe("SELECT $body$a;b$body$;");
  });

  it("keeps semicolons inside ClickHouse strings (backtick identifiers)", () => {
    const list = ranges("SELECT `a;b` FROM t; SELECT 'x;y'", "clickhouse");
    expect(list).toHaveLength(2);
    expect(list[1]!.text).toBe("SELECT 'x;y'");
  });

  it("keeps a semicolon after a ClickHouse backslash-escaped quote inside the string", () => {
    const first = "SELECT 'x\\';y' AS first_value;";
    const list = ranges(`${first} SELECT 2 AS b;`, "clickhouse");
    expect(list.map(({ text }) => text)).toEqual([first, "SELECT 2 AS b;"]);
  });

  it("skips empty statements", () => {
    const list = ranges("SELECT 1;;\n;SELECT 2");
    expect(list).toHaveLength(2);
    expect(list[1]!.text).toBe("SELECT 2");
  });

  it("handles CRLF line endings", () => {
    // WHY: EditorState normalizes \r\n and \r to \n on creation, so the
    // splitter never sees carriage returns — assert that invariant holds.
    const list = ranges("SELECT 1;\r\nSELECT 2");
    expect(list).toHaveLength(2);
    expect(list[1]!.text).toBe("SELECT 2");
  });

  it("returns no ranges for whitespace/comment-only input", () => {
    expect(ranges("  -- only a comment\n")).toEqual([]);
  });
});

describe("sqlStatementAtPosition (cursor rule)", () => {
  const doc = "SELECT 1;\nSELECT 2;\n-- tail\nSELECT 3";
  const ranges = sqlStatementRanges(sqlWorksheetState(doc, "mysql"));

  it("resolves a cursor inside each statement to that statement", () => {
    expect(sqlStatementAtPosition(ranges, 2)!.from).toBe(0);
    expect(sqlStatementAtPosition(ranges, 12)!.from).toBe(10);
    // The comment's trailing newline folds into the next statement's range.
    expect(sqlStatementAtPosition(ranges, doc.length)!.from).toBe(28);
  });

  it("resolves a cursor on the trailing semicolon to that statement", () => {
    expect(sqlStatementAtPosition(ranges, 8)!.from).toBe(0);
  });

  it("resolves whitespace between statements to the preceding statement", () => {
    // Position 9 is the newline between the first and second statements.
    expect(sqlStatementAtPosition(ranges, 9)!.from).toBe(0);
  });

  it("resolves a comment between statements to the preceding statement", () => {
    expect(sqlStatementAtPosition(ranges, 23)!.from).toBe(10);
  });

  it("resolves a cursor before the first statement to the first", () => {
    const withLead = sqlStatementRanges(sqlWorksheetState("\n\nSELECT 1; SELECT 2", "mysql"));
    expect(sqlStatementAtPosition(withLead, 0)!.from).toBe(2);
  });

  it("resolves a cursor after the last statement to the last", () => {
    expect(sqlStatementAtPosition(ranges, doc.length + 5)!.from).toBe(28);
  });
});

describe("resolveWorksheetRunScope", () => {
  it("sends exactly a non-whitespace selection", () => {
    const doc = "SELECT 1;\nSELECT 2";
    const r = scoped(doc, "mysql", 0, 8);
    expect(r.scope).toBe("selection");
    expect(r.text).toBe("SELECT 1");
  });

  it("sends a selection spanning several statements as-is", () => {
    const doc = "SELECT 1;\nSELECT 2";
    const r = scoped(doc, "mysql", 0, doc.length);
    expect(r.scope).toBe("selection");
    expect(r.text).toBe(doc);
  });

  it("falls back to the cursor statement for a whitespace-only selection", () => {
    const doc = "SELECT 1;\n \nSELECT 2";
    // Select the blank line between the statements; head sits in the gap.
    const r = scoped(doc, "mysql", 10, 11);
    expect(r.scope).toBe("statement");
    expect(r.text).toBe("SELECT 1;");
  });

  it("resolves the statement under the cursor", () => {
    const doc = "SELECT 1 AS a;\nSELECT 2 AS b;";
    const r = scoped(doc, "mysql", doc.indexOf("2 AS"));
    expect(r.scope).toBe("statement");
    expect(r.text).toBe("SELECT 2 AS b;");
    expect(r.statementRange).toEqual({ from: 15, to: 29 });
  });

  it("sends a single-statement document byte-identically", () => {
    const doc = "  SELECT 1;  -- trailing note\n";
    const r = scoped(doc, "mysql", 5);
    expect(r.scope).toBe("document");
    expect(r.text).toBe(doc);
  });

  it("treats a multi-statement document with a dollar-quoted semicolon correctly (postgresql)", () => {
    const doc = "SELECT $$a;b$$::text AS v /* ; */;\nSELECT 2";
    const r = scoped(doc, "postgresql", doc.length);
    expect(r.scope).toBe("statement");
    expect(r.text).toBe("SELECT 2");
  });

  it("never splits native engines", () => {
    const doc = "GET a\nHGET h f";
    const r = scoped(doc, "redis", 4);
    expect(r.scope).toBe("document");
    expect(r.text).toBe(doc);
  });

  it("still honors a selection on native engines", () => {
    const doc = "GET a\nHGET h f";
    const r = scoped(doc, "redis", 0, 5);
    expect(r.scope).toBe("selection");
    expect(r.text).toBe("GET a");
  });

  it("sends the whole document when there is nothing to run", () => {
    const r = scoped("", "mysql");
    expect(r.scope).toBe("document");
    expect(r.text).toBe("");
  });
});
