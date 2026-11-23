import { describe, expect, it, vi } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";

import { createSqlCompletionSource } from "@/components/query/sql-code-editor-client";
import type {
  SchemaNamespace,
  TableColumnFetcher,
} from "@/lib/query-sql-completion";
import { sqlWorksheetState } from "@/lib/sql-run-scope";

// The completion source must anchor suggestions at the typed word so
// CodeMirror's own filtering narrows the list: `ord` narrows the table/keyword
// list to `orders`, and `o.st` must still resolve the alias's columns with
// `from` right after the dot — the two placements this fixes.
describe("createSqlCompletionSource", () => {
  const ns: SchemaNamespace = {
    tables: [{ name: "orders", kind: "table" }],
    loadedColumns: { orders: ["id", "status", "total"] },
  };

  function contextFor(doc: string, pos = doc.length, explicit = false, engine = "mysql") {
    // Completion runs on the worksheet dialect's syntax tree, so the state
    // must carry the same sql() extension the editor configures.
    return new CompletionContext(sqlWorksheetState(doc, engine), pos, explicit);
  }

  it("anchors non-dot suggestions at the typed word start", () => {
    const doc = "select * from ord";
    const result = createSqlCompletionSource(ns, undefined)(
      contextFor(doc),
    ) as { from: number; options: { label: string }[] } | null;
    expect(result).not.toBeNull();
    expect(result!.from).toBe(doc.indexOf("ord"));
    expect(result!.options.some((o) => o.label === "orders")).toBe(true);
  });

  it("returns null when no word is typed and completion is implicit", () => {
    const doc = "select * from ";
    const result = createSqlCompletionSource(ns, undefined)(contextFor(doc));
    expect(result).toBeNull();
  });

  it("resolves alias columns after the dot with from right after the dot", async () => {
    const doc = "select * from orders o where o.st";
    const ctx = contextFor(doc);
    const result = await createSqlCompletionSource(ns, undefined)(ctx);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(doc.length - "st".length);
    const labels = (result!.options as { label: string }[]).map((o) => o.label);
    expect(labels).toEqual(["id", "status", "total"]);
  });
});

// Scope-aware bindings (item 9): aliases and CTEs resolve through the Lezer
// tree only — a catalog fetch fires exclusively for catalog bindings, and
// derived/CTE projections never leak columns that were not selected.
describe("createSqlCompletionSource scoped bindings", () => {
  const ns: SchemaNamespace = {
    tables: [
      { name: "t1", kind: "table" },
      { name: "b", kind: "table" },
      { name: "e2e.items", kind: "table" },
    ],
    loadedColumns: {
      t1: ["x"],
      b: ["id"],
      "e2e.items": ["name", "id"],
    },
  };

  function contextFor(
    doc: string,
    pos = doc.length,
    engine = "mysql",
    explicit = true,
  ) {
    return new CompletionContext(sqlWorksheetState(doc, engine), pos, explicit);
  }

  function labels(result: unknown): string[] {
    return ((result as { options: { label: string }[] }).options ?? []).map(
      (o) => o.label,
    );
  }

  it("resolves a quoted PG alias to its catalog table and quotes the apply", async () => {
    const doc = 'SELECT "O".na FROM e2e.items AS "O"';
    const pos = doc.indexOf(".na") + 3;
    const fetcher = vi.fn(async (table: string) =>
      table === "e2e.items" ? ["name", "id"] : [],
    );
    // Loaded cache must not satisfy this lookup: the binding is qualified and
    // the unqualified cache key is a different entry.
    const emptyNs: SchemaNamespace = { tables: ns.tables, loadedColumns: {} };
    const result = (await createSqlCompletionSource(
      emptyNs,
      fetcher,
      "postgresql",
    )(contextFor(doc, pos, "postgresql"))) as {
      from: number;
      options: { label: string; apply?: string }[];
    } | null;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("e2e.items");
    expect(result).not.toBeNull();
    expect(result!.from).toBe(doc.indexOf(".na") + 1);
    const name = result!.options.find((o) => o.label === "name");
    expect(name?.apply).toBe('"name"');
  });

  it("keeps nested subquery bindings local to the inner query", async () => {
    const doc =
      "SELECT a.x FROM t1 a WHERE EXISTS (SELECT b.y FROM t2 b WHERE b.z)";
    const pos = doc.indexOf("b.z") + 3;
    const fetcher: TableColumnFetcher = async (table: string) =>
      table === "t2" ? ["y", "z"] : ["outer-col"];
    const spy = vi.fn(fetcher);
    const result = (await createSqlCompletionSource(
      { tables: ns.tables, loadedColumns: {} },
      spy,
    )(contextFor(doc, pos))) as { options: { label: string }[] } | null;
    expect(spy).toHaveBeenCalledWith("t2");
    expect(labels(result)).toEqual(["y", "z"]);

    // The outer alias `a` is not visible inside the subquery.
    const outer = doc.replace("b.z", "a.z");
    const outerPos = outer.indexOf("a.z") + 3;
    const inner = await createSqlCompletionSource(ns, spy)(
      contextFor(outer, outerPos),
    );
    expect(inner).toBeNull();
  });

  it("ignores FROM/JOIN text inside strings and comments", async () => {
    const doc = "SELECT 'FROM j q' AS s, o.na FROM t1 o WHERE o.st";
    const pos = doc.indexOf("o.st") + 4;
    const result = (await createSqlCompletionSource(ns, undefined)(
      contextFor(doc, pos),
    )) as { options: { label: string }[] } | null;
    expect(labels(result)).toEqual(["x"]);

    const doc2 = "SELECT /* JOIN other q */ o.na FROM t1 o WHERE o.st";
    const pos2 = doc2.indexOf("o.st") + 4;
    const result2 = (await createSqlCompletionSource(ns, undefined)(
      contextFor(doc2, pos2),
    )) as { options: { label: string }[] } | null;
    expect(labels(result2)).toEqual(["x"]);
  });

  it("suppresses column suggestions inside strings and comments", async () => {
    const doc = "SELECT o.x FROM t1 o WHERE note = 'o.st";
    const inside = await createSqlCompletionSource(ns, undefined)(
      contextFor(doc),
    );
    expect(inside).toBeNull();
    const doc2 = "SELECT o.x FROM t1 o WHERE note = 1 -- o.st";
    const comment = await createSqlCompletionSource(ns, undefined)(
      contextFor(doc2),
    );
    expect(comment).toBeNull();
  });

  it("exposes an earlier CTE name in relation position and its projection after the dot", async () => {
    const doc =
      "WITH picked AS (SELECT name AS item_name FROM e2e.items) SELECT * FROM pic";
    const pos = doc.indexOf("FROM pic") + "FROM pic".length;
    const result = (await createSqlCompletionSource(ns, undefined)(
      contextFor(doc, pos),
    )) as { options: { label: string; apply?: string }[] } | null;
    const picked = result!.options.find((o) => o.label === "picked");
    expect(picked?.apply).toBe("`picked`");

    const doc2 =
      "WITH picked AS (SELECT name AS item_name FROM e2e.items) SELECT p.item_ FROM picked p";
    const pos2 = doc2.indexOf("p.item_") + "p.item_".length;
    const dot = (await createSqlCompletionSource(ns, undefined)(
      contextFor(doc2, pos2),
    )) as { options: { label: string }[] } | null;
    expect(labels(dot)).toEqual(["item_name"]);
  });

  it("lets a real table shadow a future CTE declared after the cursor's body", async () => {
    // Inside the first body, `b` must stay the catalog table: CTE `b` is
    // declared after the cursor's group and cannot shadow it.
    const doc =
      "WITH a AS (SELECT b.id FROM b), b AS (SELECT 1 AS c) SELECT * FROM a";
    const pos = doc.indexOf("b.id") + 2;
    const result = (await createSqlCompletionSource(ns, undefined)(
      contextFor(doc, pos),
    )) as { options: { label: string }[] } | null;
    expect(labels(result)).toEqual(["id"]);
  });

  it("lets a nested WITH shadow an outer CTE", async () => {
    const doc =
      "WITH c AS (SELECT 1 AS out1) SELECT * FROM (WITH c AS (SELECT 2 AS out2) SELECT c.out2 FROM c) s";
    const pos = doc.indexOf("c.out2") + 2;
    const result = (await createSqlCompletionSource(ns, undefined)(
      contextFor(doc, pos),
    )) as { options: { label: string }[] } | null;
    expect(labels(result)).toEqual(["out2"]);
  });

  it("offers only projected columns for a derived table and never fetches", async () => {
    const doc = "SELECT d.item_ FROM (SELECT name AS item_name, id FROM e2e.items) d";
    const pos = doc.indexOf("d.item_") + "d.item_".length;
    const fetcher = vi.fn(async () => ["should-not-be-used"]);
    const result = (await createSqlCompletionSource(ns, fetcher)(
      contextFor(doc, pos),
    )) as { options: { label: string }[] } | null;
    expect(fetcher).not.toHaveBeenCalled();
    expect(labels(result)).toEqual(["item_name", "id"]);
  });

  it("offers no columns for a wildcard derived table", async () => {
    const doc = "SELECT d.z FROM (SELECT * FROM e2e.items) d";
    const pos = doc.indexOf("d.z") + 3;
    const result = (await createSqlCompletionSource(ns, undefined)(
      contextFor(doc, pos),
    )) as { options: { label: string }[] } | null;
    expect(result).not.toBeNull();
    expect(labels(result)).toEqual([]);
  });

  it("does not let the cursor borrow another statement's bindings", async () => {
    const doc = "SELECT o.x FROM t1 o; SELECT q.y FROM t2 q WHERE q.";
    const pos = doc.indexOf("q.y") + 3;
    const result = await createSqlCompletionSource(ns, async (t) =>
      t === "t2" ? ["y"] : [],
    )(contextFor(doc, pos));
    // `q` belongs to the second statement — resolving it inside the first
    // statement would be a different scope; the cursor sits in statement two.
    expect(result).not.toBeNull();
    expect(labels(result)).toEqual(["y"]);

    const doc2 = "SELECT o.x FROM t1 o; SELECT q.y FROM t2 q WHERE o.";
    const pos2 = doc2.indexOf("q.y") + 3;
    // Same position: qualifier `o` is bound only in statement one.
    const result2 = await createSqlCompletionSource(ns, undefined)(
      contextFor(doc2, pos2),
    );
    expect(result2).toBeNull();
  });

  it("offers catalog columns for a qualified source name without alias", async () => {
    const doc = "SELECT items.na FROM e2e.items WHERE items.na";
    const pos = doc.indexOf("items.na", 10) + "items.na".length;
    const result = (await createSqlCompletionSource(ns, undefined)(
      contextFor(doc, pos, "postgresql"),
    )) as { options: { label: string }[] } | null;
    expect(labels(result)).toEqual(["name", "id"]);
  });

  it.each([
    [
      "CTE projection with Keyword-lexed PG names",
      "WITH picked AS (SELECT id, name FROM e2e.items) SELECT p. FROM picked AS p",
      "postgresql",
    ],
    [
      "explicit PG CTE column list with Keyword-lexed names",
      "WITH picked(id,name) AS (SELECT id, name FROM e2e.items) SELECT p. FROM picked AS p",
      "postgresql",
    ],
    [
      "derived projection with Builtin-lexed MySQL name",
      "SELECT d. FROM (SELECT status FROM t1) AS d",
      "mysql",
    ],
  ])(
    "completes dialect-lexed identifiers in projection slots: %s",
    async (_label, doc, engine) => {
      const pos = doc.indexOf("SELECT p.") >= 0
        ? doc.indexOf("SELECT p.") + "SELECT p.".length
        : doc.indexOf("d.") + "d.".length;
      const fetcher = vi.fn(async () => ["should-not-be-used"]);
      const result = (await createSqlCompletionSource(
        ns,
        fetcher,
        engine as "mysql" | "postgresql",
      )(contextFor(doc, pos, engine as "mysql" | "postgresql"))) as {
        options: { label: string }[];
      } | null;
      expect(fetcher).not.toHaveBeenCalled();
      expect(labels(result)).toEqual(
        _label.includes("MySQL") ? ["status"] : ["id", "name"],
      );
    },
  );

  it("does not bind IS DISTINCT FROM operands as relations", async () => {
    const doc =
      "SELECT users. FROM t1 AS o WHERE o.x IS DISTINCT FROM users";
    const pos = doc.indexOf("users.") + "users.".length;
    const fetcher = vi.fn(async () => ["id"]);
    const result = await createSqlCompletionSource(ns, fetcher, "postgresql")(
      contextFor(doc, pos, "postgresql"),
    );
    expect(result).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("honours a PostgreSQL derived alias column list instead of the projection", async () => {
    const doc =
      "SELECT d. FROM (SELECT id, name FROM e2e.items) AS d(renamed)";
    const pos = doc.indexOf("d.") + "d.".length;
    const fetcher = vi.fn(async () => ["should-not-be-used"]);
    const result = (await createSqlCompletionSource(ns, fetcher, "postgresql")(
      contextFor(doc, pos, "postgresql"),
    )) as { options: { label: string }[] } | null;
    expect(fetcher).not.toHaveBeenCalled();
    expect(labels(result)).toEqual(["renamed"]);
  });
});
