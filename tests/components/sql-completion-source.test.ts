import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";

import { createSqlCompletionSource } from "@/components/query/sql-code-editor-client";
import type { SchemaNamespace } from "@/lib/query-sql-completion";

// The completion source must anchor suggestions at the typed word so
// CodeMirror's own filtering narrows the list: `ord` narrows the table/keyword
// list to `orders`, and `o.st` must still resolve the alias's columns with
// `from` right after the dot — the two placements this fixes.
describe("createSqlCompletionSource", () => {
  const ns: SchemaNamespace = {
    tables: [{ name: "orders", kind: "table" }],
    loadedColumns: { orders: ["id", "status", "total"] },
  };

  function contextFor(doc: string, pos = doc.length, explicit = false) {
    return new CompletionContext(EditorState.create({ doc }), pos, explicit);
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
