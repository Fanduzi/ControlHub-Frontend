"use client"; // allow: SIZE_OK — three editor themes (light/dark/high-contrast) + syntax highlighting are data, not logic

import { useCallback, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, MySQL, StandardSQL } from "@codemirror/lang-sql";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";
import { Prec, type Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

import { cn } from "@/lib/utils";
import type { QueryEditorThemePreference } from "@/lib/query-editor-preferences";
import {
  buildKeywordCompletions,
  buildTableCompletions,
  buildDatabaseQualifiedCompletions,
  buildColumnCompletionsForDot,
  parseActiveStatement,
  extractTableAliases,
  type SchemaNamespace,
  type TableColumnFetcher,
} from "@/lib/query-sql-completion";

export type SqlCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  engine?: string;
  onRun?: () => void;
  onFormat?: () => void;
  onEditorView?: (view: EditorView) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  themePreference?: QueryEditorThemePreference;
  height?: number;
  schemaNamespace?: SchemaNamespace;
  columnFetcher?: TableColumnFetcher;
};

function createSqlCompletionSource(
  ns: SchemaNamespace | undefined,
  fetcher: TableColumnFetcher | undefined,
): (ctx: CompletionContext) => CompletionResult | Promise<CompletionResult | null> | null {
  return (ctx: CompletionContext) => {
    const dotMatch = ctx.matchBefore(/[\w`]+\./);
    if (dotMatch) {
      const prefix = dotMatch.text.slice(0, -1).replace(/`/g, "");
      const stmt = parseActiveStatement(ctx.state.doc.toString(), ctx.pos);
      const aliases = extractTableAliases(stmt);

      const tableName = aliases[prefix] ?? prefix;
      const loaded = ns?.loadedColumns?.[tableName];
      if (loaded) {
        return {
          from: dotMatch.to,
          options: loaded.map((col) => ({ label: col, type: "field" })),
          validFor: /[\w`]*/,
        };
      }

      if (!fetcher || !ns) {
        return { from: dotMatch.to, options: [], validFor: /[\w`]*/ };
      }

      return buildColumnCompletionsForDot(prefix, ns, fetcher, aliases).then(
        (cols) => ({
          from: dotMatch.to,
          options: cols as import("@codemirror/autocomplete").Completion[],
          validFor: /[\w`]*/,
        }),
      );
    }

    const options: import("@codemirror/autocomplete").Completion[] = [];

    if (ns) {
      options.push(...buildTableCompletions(ns));
      options.push(...buildDatabaseQualifiedCompletions(ns));
    }

    options.push(...buildKeywordCompletions());

    return { from: ctx.pos, options, validFor: /[\w`]*/ };
  };
}

type ResolvedEditorTheme = Exclude<QueryEditorThemePreference, "system">;

const lightEditorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "#ffffff", color: "#1f2937" },
    "&.cm-focused": { outline: "none" },
    ".cm-content": { caretColor: "#2563eb" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#2563eb" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "#bfdbfe",
    },
    ".cm-gutters": {
      backgroundColor: "#f8fafc",
      borderRight: "1px solid #e2e8f0",
      color: "#64748b",
    },
    ".cm-activeLine": { backgroundColor: "#eff6ff" },
    ".cm-activeLineGutter": { backgroundColor: "#e0f2fe", color: "#0f172a" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px" },
  },
  { dark: false },
);

const darkEditorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "#0f172a", color: "#e2e8f0" },
    "&.cm-focused": { outline: "none" },
    ".cm-content": { caretColor: "#93c5fd" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#93c5fd" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "#1d4ed8",
    },
    ".cm-gutters": {
      backgroundColor: "#111827",
      borderRight: "1px solid #334155",
      color: "#94a3b8",
    },
    ".cm-activeLine": { backgroundColor: "#1e293b" },
    ".cm-activeLineGutter": { backgroundColor: "#1e293b", color: "#e2e8f0" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px" },
  },
  { dark: true },
);

const highContrastEditorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "#000000", color: "#ffffff" },
    "&.cm-focused": { outline: "2px solid #facc15" },
    ".cm-content": { caretColor: "#facc15" },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#facc15",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "#1d4ed8",
    },
    ".cm-gutters": {
      backgroundColor: "#050505",
      borderRight: "1px solid #ffffff",
      color: "#ffffff",
    },
    ".cm-activeLine": { backgroundColor: "#1f2937" },
    ".cm-activeLineGutter": { backgroundColor: "#1f2937", color: "#ffffff" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px" },
  },
  { dark: true },
);

const layoutTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": { overflow: "auto" },
});

const lightSyntax = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#1d4ed8", fontWeight: "600" },
    { tag: tags.string, color: "#b45309" },
    { tag: tags.number, color: "#047857" },
    { tag: tags.comment, color: "#64748b", fontStyle: "italic" },
    { tag: tags.operator, color: "#334155" },
    { tag: tags.function(tags.variableName), color: "#7c3aed" },
    { tag: tags.typeName, color: "#0f766e" },
  ]),
);

const darkSyntax = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#93c5fd", fontWeight: "600" },
    { tag: tags.string, color: "#fdba74" },
    { tag: tags.number, color: "#86efac" },
    { tag: tags.comment, color: "#94a3b8", fontStyle: "italic" },
    { tag: tags.operator, color: "#cbd5e1" },
    { tag: tags.function(tags.variableName), color: "#c4b5fd" },
    { tag: tags.typeName, color: "#5eead4" },
  ]),
);

const highContrastSyntax = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#93c5fd", fontWeight: "700" },
    { tag: tags.string, color: "#fbbf24" },
    { tag: tags.number, color: "#86efac" },
    { tag: tags.comment, color: "#d1d5db", fontStyle: "italic" },
    { tag: tags.operator, color: "#ffffff" },
    { tag: tags.function(tags.variableName), color: "#f0abfc" },
    { tag: tags.typeName, color: "#67e8f9" },
  ]),
);

const editorThemes: Record<ResolvedEditorTheme, Extension> = {
  light: lightEditorTheme,
  dark: darkEditorTheme,
  high_contrast: highContrastEditorTheme,
};

const syntaxThemes: Record<ResolvedEditorTheme, Extension> = {
  light: lightSyntax,
  dark: darkSyntax,
  high_contrast: highContrastSyntax,
};

function resolveEditorTheme(
  preference: QueryEditorThemePreference,
): ResolvedEditorTheme {
  if (preference !== "system") {
    return preference;
  }
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function SqlCodeEditorClient({
  value,
  onChange,
  engine,
  onRun,
  onFormat,
  onEditorView,
  ariaLabel,
  disabled = false,
  className,
  themePreference = "system",
  height,
  schemaNamespace,
  columnFetcher,
}: SqlCodeEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const resolvedTheme = resolveEditorTheme(themePreference);

  const handleCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
    onEditorView?.(view);
  }, [onEditorView]);

  const sqlCompletionSource = useCallback(
    createSqlCompletionSource(schemaNamespace, columnFetcher),
    [schemaNamespace, columnFetcher],
  );

  const extensions = useMemo(() => {
    const normalizedEngine = engine?.trim().toLowerCase();
    const dialect =
      normalizedEngine === "mysql" || normalizedEngine === "tidb"
        ? MySQL
        : StandardSQL;

    const shortcuts = Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            onRun?.();
            return true;
          },
          preventDefault: true,
        },
        {
          key: "Mod-Shift-f",
          run: () => {
            onFormat?.();
            return true;
          },
          preventDefault: true,
        },
      ]),
    );

    const completionExtension = autocompletion({
      override: [sqlCompletionSource],
      activateOnTyping: true,
      defaultKeymap: true,
    });

    return [
      sql({ dialect }),
      shortcuts,
      layoutTheme,
      syntaxThemes[resolvedTheme],
      completionExtension,
    ];
  }, [engine, onRun, onFormat, resolvedTheme, sqlCompletionSource]);

  return (
    <CodeMirror
      value={value}
      height={height === undefined ? "220px" : `${height}px`}
      className={cn("text-sm", className)}
      theme={editorThemes[resolvedTheme]}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={handleCreateEditor}
      editable={!disabled}
      readOnly={disabled}
      aria-label={ariaLabel}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
      }}
    />
  );
}
