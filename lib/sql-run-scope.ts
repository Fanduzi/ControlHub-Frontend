/**
 * Statement-boundary resolution for the governed worksheet editor.
 *
 * Boundaries come from the CodeMirror lang-sql syntax tree for the editor's
 * configured dialect, so quoted strings, comments, dollar-quoted bodies and
 * escaped quotes never read as `;` separators. This module is a UX layer only:
 * the backend guard remains the authoritative single-statement check.
 */

import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import {
  sql,
  MySQL,
  PostgreSQL,
  StandardSQL,
  SQLDialect,
} from "@codemirror/lang-sql";

/** Engines whose worksheet holds a native command, not splittable SQL. */
export function isNativeCommandEngine(engine: string | undefined): boolean {
  const normalized = engine?.trim().toLowerCase();
  return normalized === "redis" || normalized === "mongodb";
}

// The stock MySQL dialect tokenizes `\'` as a string end; real MySQL treats
// backslash escapes as part of the literal. One shared instance keeps the
// editor highlighting and the boundary splitter on identical rules.
const worksheetMySQLDialect = SQLDialect.define({
  ...MySQL.spec,
  backslashEscapes: true,
});

// CodeMirror supplies token boundaries (including quoted identifiers, strings
// and comments). ClickHouse execution and disclosure stay on the backend.
export const clickHouseEditorDialect = SQLDialect.define({
  ...StandardSQL.spec,
  identifierQuotes: '`"',
  backslashEscapes: true,
});

/** The SQL dialect the worksheet editor configures for an engine. */
export function sqlDialectForEngine(engine: string | undefined): SQLDialect {
  const normalized = engine?.trim().toLowerCase();
  if (normalized === "mysql" || normalized === "tidb") return worksheetMySQLDialect;
  if (normalized === "postgresql") return PostgreSQL;
  if (normalized === "clickhouse") return clickHouseEditorDialect;
  return StandardSQL;
}

/** EditorState carrying the worksheet SQL extension for an engine. */
export function sqlWorksheetState(doc: string, engine: string | undefined): EditorState {
  return EditorState.create({
    doc,
    extensions: [sql({ dialect: sqlDialectForEngine(engine) })],
  });
}

export type SqlStatementRange = {
  readonly from: number;
  readonly to: number;
};

function isExecutableStatement(state: EditorState, range: SqlStatementRange): boolean {
  const text = state.sliceDoc(range.from, range.to).trim();
  return text.replace(/^;+|;+$/g, "").trim() !== "";
}

/**
 * Non-empty top-level Statement ranges under the Script root, in document
 * order. `;`-only statements are skipped: they carry no executable text, so
 * the cursor rule must not resolve to them.
 */
export function sqlStatementRanges(state: EditorState): SqlStatementRange[] {
  // Never split on a partial parse: a prefix-only tree would pick a fragment
  // as the "current" statement, so fall back to the whole-document behavior.
  const tree = ensureSyntaxTree(state, state.doc.length, 100);
  if (!tree || tree.length !== state.doc.length) return [];
  const ranges: SqlStatementRange[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "Statement") continue;
    const range = { from: node.from, to: node.to };
    if (isExecutableStatement(state, range)) ranges.push(range);
  }
  return ranges;
}

/**
 * Cursor rule: inside a statement's range (trailing `;` included) resolves to
 * that statement; whitespace/comments between statements resolve to the
 * preceding one; before the first resolves to the first.
 */
export function sqlStatementAtPosition(
  ranges: readonly SqlStatementRange[],
  pos: number,
): SqlStatementRange | null {
  if (ranges.length === 0) return null;
  let chosen = ranges[0]!;
  if (pos <= chosen.from) return chosen;
  for (const range of ranges) {
    if (range.from <= pos) chosen = range;
    else break;
  }
  return chosen;
}

export type WorksheetRunScope = "selection" | "statement" | "document";

export type ResolvedRunScope = {
  /** Exact text a Run should send. */
  readonly text: string;
  readonly scope: WorksheetRunScope;
  /** Highlightable statement range; null when the scope is not a statement. */
  readonly statementRange: SqlStatementRange | null;
};

/**
 * Resolve what Run sends for an editor state:
 * 1. a non-whitespace selection sends exactly the selected text;
 * 2. SQL engines send the statement containing the cursor;
 * 3. native engines never split — the whole document (selection aside);
 * 4. a document with at most one statement sends the doc verbatim so a
 *    single-statement worksheet stays byte-identical to the unscoped path.
 */
export function resolveWorksheetRunScope(
  state: EditorState,
  engine: string | undefined,
): ResolvedRunScope {
  const doc = state.doc.toString();
  const selection = state.selection.main;
  if (!selection.empty) {
    const selected = doc.slice(selection.from, selection.to);
    if (selected.trim() !== "") {
      return { text: selected, scope: "selection", statementRange: null };
    }
  }
  if (isNativeCommandEngine(engine)) {
    return { text: doc, scope: "document", statementRange: null };
  }
  const ranges = sqlStatementRanges(state);
  if (ranges.length <= 1) {
    return { text: doc, scope: "document", statementRange: ranges[0] ?? null };
  }
  const range = sqlStatementAtPosition(ranges, selection.head)!;
  return {
    text: doc.slice(range.from, range.to).trim(),
    scope: "statement",
    statementRange: range,
  };
}
