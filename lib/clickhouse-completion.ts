import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { ensureSyntaxTree } from "@codemirror/language";
import { SQLDialect, StandardSQL } from "@codemirror/lang-sql";
import {
  buildTableCompletions,
  type SchemaNamespace,
} from "@/lib/query-sql-completion";

// CodeMirror supplies token boundaries (including quoted identifiers, strings and comments).
// ClickHouse execution and disclosure decisions remain on the backend.
export const clickHouseEditorDialect = SQLDialect.define({
  ...StandardSQL.spec,
  identifierQuotes: '`"',
});
const keywords = [
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "BETWEEN",
  "NOT BETWEEN",
  "GROUP BY",
  "ORDER BY",
  "COUNT",
  "AS",
  "ASC",
  "DESC",
  "LIMIT",
].map((label) => ({ label, type: "keyword" }));

export function clickHouseCompletions(
  ctx: CompletionContext,
  ns?: SchemaNamespace,
): CompletionResult | null {
  const { state, pos } = ctx;
  // Keep completion work bounded to the backend's worksheet statement budget.
  if (state.doc.length > 8192) return null;
  const tree = ensureSyntaxTree(state, state.doc.length, 20);
  if (!tree) return null;
  const word = ctx.matchBefore(/[A-Za-z0-9_]*/);
  if (!word || (!word.text && !ctx.explicit)) return null;
  // Whitespace just after FROM can be outside the Statement node.
  const anchor = state.sliceDoc(0, pos).trimEnd().length;
  const leaf = tree.resolveInner(anchor, -1);
  if (
    [
      "String",
      "LineComment",
      "BlockComment",
      "Number",
      "QuotedIdentifier",
      ";",
    ].includes(leaf.name)
  )
    return null;
  let statement = leaf.parent;
  while (statement && statement.name !== "Statement")
    statement = statement.parent;
  const range = {
    from: word.from,
    to: leaf.name === "Identifier" && leaf.from === word.from ? leaf.to : pos,
    validFor: /^\w*$/,
  };
  const fallback = { ...range, options: keywords };
  if (!statement || !ns) return fallback;
  const tokens: (typeof leaf)[] = [];
  for (let tok = statement.firstChild; tok; tok = tok.nextSibling) {
    if (!tok.name.endsWith("Comment")) tokens.push(tok);
  }
  const text = (tok: (typeof tokens)[number]) =>
    state.sliceDoc(tok.from, tok.to);
  const isKeyword = (tok: (typeof tokens)[number], kw: string) =>
    tok.name === "Keyword" && text(tok).toUpperCase() === kw;
  const fromIndex = tokens.findIndex((tok) => isKeyword(tok, "FROM"));
  if (fromIndex < 0 || !tokens[0] || !isKeyword(tokens[0], "SELECT"))
    return fallback;
  // An inner SELECT introduces another scope, even if FROM/JOIN is nested in Parens.
  const cursor = statement.cursor();
  while (cursor.next() && cursor.from < statement.to) {
    if (cursor.name !== "Keyword") continue;
    const keyword = state.sliceDoc(cursor.from, cursor.to).toUpperCase();
    if (
      (keyword === "SELECT" && cursor.from !== tokens[0].from) ||
      keyword === "JOIN" ||
      keyword === "UNION"
    )
      return fallback;
  }
  const from = tokens[fromIndex],
    source = tokens[fromIndex + 1];
  const inTableSlot =
    word.from >= from.to &&
    (!source ||
      source.name === ";" ||
      (word.from <= source.from && pos <= source.to));
  if (inTableSlot)
    return {
      ...range,
      options: buildTableCompletions(ns),
    };
  if (!source || !["Identifier", "QuotedIdentifier"].includes(source.name))
    return fallback;
  const next = tokens[fromIndex + 2];
  if (
    next &&
    next.name !== ";" &&
    !["WHERE", "GROUP", "ORDER", "LIMIT"].some((kw) => isKeyword(next, kw))
  )
    return fallback;
  if (tokens.some((tok) => tok.to <= word.from && isKeyword(tok, "LIMIT")))
    return fallback;
  const name =
    source.name === "QuotedIdentifier"
      ? text(source).slice(1, -1)
      : text(source);
  if (
    !ns.tables.some((t) => t.name === name) ||
    !ns.loadedColumns ||
    !Object.hasOwn(ns.loadedColumns, name)
  )
    return fallback;
  // Only direct column references are executable in the single-table worksheet.
  if (state.sliceDoc(Math.max(0, word.from - 1), word.from) === ".")
    return null;
  return {
    ...range,
    options: [
      ...ns.loadedColumns[name].map((label) => ({ label, type: "field" })),
      ...keywords,
    ],
  };
}
