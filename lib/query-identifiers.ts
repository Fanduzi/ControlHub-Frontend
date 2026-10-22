// input: none (pure identifier helpers)
// output: dialect-aware identifier quoting/identity helpers (mysql + postgresql)
// pos: shared helper for object identity and SQL reference rendering
// note: if this file changes, update this header and lib/README.md.
export type IdentifierDialect = "mysql" | "postgresql";

export type ObjectIdentifierInput = {
  readonly database: string;
  readonly name: string;
  readonly activeDatabase: string | null;
  /** Object's own PostgreSQL namespace (from ObjectSummary.schema). */
  readonly schema?: string;
  /** Worksheet-pinned PostgreSQL namespace; objects there insert unqualified. */
  readonly activeSchema?: string | null;
  /** Defaults to MySQL backtick quoting for backward compatibility. */
  readonly dialect?: IdentifierDialect;
};

export function quoteQueryIdentifier(name: string, dialect: IdentifierDialect = "mysql"): string {
  if (dialect === "postgresql") {
    return `"${name.replaceAll('"', '""')}"`;
  }
  return `\`${name.replaceAll("`", "``")}\``;
}

export function objectIdentifier({
  database,
  name,
  activeDatabase,
  schema,
  activeSchema,
  dialect = "mysql",
}: ObjectIdentifierInput): string {
  const quotedName = quoteQueryIdentifier(name, dialect);
  if (dialect === "postgresql") {
    // PostgreSQL cannot cross database boundaries inside one statement; the
    // schema qualifier disambiguates namespaces outside the pinned context.
    if (schema !== undefined && schema !== "" && schema !== activeSchema) {
      return `${quoteQueryIdentifier(schema, dialect)}.${quotedName}`;
    }
    return quotedName;
  }
  return database === activeDatabase
    ? quotedName
    : `${quoteQueryIdentifier(database, dialect)}.${quotedName}`;
}

import type { EditorView } from "@codemirror/view";

export function insertIdentifierAtSelection(view: EditorView, identifier: string): void {
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: identifier },
    selection: { anchor: selection.from + identifier.length },
  });
}
