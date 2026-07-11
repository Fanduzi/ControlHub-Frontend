export type ObjectIdentifierInput = {
  readonly database: string;
  readonly name: string;
  readonly activeDatabase: string | null;
};

export function quoteQueryIdentifier(name: string): string {
  return `\`${name.replaceAll("`", "``")}\``;
}

export function objectIdentifier({ database, name, activeDatabase }: ObjectIdentifierInput): string {
  const quotedName = quoteQueryIdentifier(name);
  return database === activeDatabase
    ? quotedName
    : `${quoteQueryIdentifier(database)}.${quotedName}`;
}

export function insertIdentifierAtSelection(view: EditorView, identifier: string): void {
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: identifier },
    selection: { anchor: selection.from + identifier.length },
  });
}
import type { EditorView } from "@codemirror/view";
