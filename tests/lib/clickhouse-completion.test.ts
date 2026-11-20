import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { sql } from "@codemirror/lang-sql";
import { describe, expect, it } from "vitest";
import {
  clickHouseCompletions,
  clickHouseEditorDialect,
} from "@/lib/clickhouse-completion";
import type { SchemaNamespace } from "@/lib/query-sql-completion";

const ns: SchemaNamespace = {
  tables: [
    { name: "events", kind: "table" },
    { name: "logs", kind: "table" },
  ],
  loadedColumns: { events: ["request_id", "request_date"], logs: ["service"] },
};
function options(input: string, explicit = false) {
  const pos = input.indexOf("|");
  const state = EditorState.create({
    doc: input.replace("|", ""),
    extensions: [sql({ dialect: clickHouseEditorDialect })],
  });
  return (
    clickHouseCompletions(new CompletionContext(state, pos, explicit), ns)
      ?.options.filter((x) => x.type === "table" || x.type === "field")
      .map((x) => x.label) ?? []
  );
}

describe("ClickHouse worksheet completion", () => {
  it("offers authorized tables in the FROM slot, including explicit empty completion", () => {
    expect(options("SELECT req FROM ev|")).toEqual(["events", "logs"]);
    expect(options("SELECT req FROM |", true)).toEqual(["events", "logs"]);
  });
  it("gets bare columns from the active statement, even when FROM follows the cursor", () => {
    for (const query of [
      "SELECT req| FROM events",
      "select req| from `events`",
      'SELECT req| FROM "events"',
      "SELECT req| FROM events; SELECT service FROM logs",
      "SELECT a FROM logs; SELECT req| FROM events",
      "SELECT req| /* FROM logs */ FROM events WHERE value='FROM logs'",
    ]) {
      expect(options(query)).toEqual(["request_id", "request_date"]);
    }
    expect(options("SELECT id FROM logs WHERE ser|")).toEqual(["service"]);
  });
  it("does not suggest another source, qualified names or literal/comment content", () => {
    for (const query of [
      "SELECT req|",
      "SELECT req| FROM private_table",
      "SELECT req| FROM db.events",
      "SELECT req| FROM events, logs",
      "SELECT req| FROM events JOIN logs ON id",
      "SELECT req| FROM (SELECT a FROM events)",
      "SELECT id FROM events WHERE id IN (SELECT req| FROM logs)",
      "SELECT req| FROM events WHERE id IN (SELECT a FROM logs)",
      "SELECT id FROM events LIMIT req|",
      "SELECT req| FROM toString(1)",
      "SELECT id FROM events WHERE id='req|'",
      "SELECT id FROM events -- req|",
      "SELECT events.req| FROM events",
    ])
      expect(options(query)).toEqual([]);
  });
});
