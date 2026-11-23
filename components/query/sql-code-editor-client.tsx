"use client"; // allow: SIZE_OK — three editor themes (light/dark/high-contrast) + syntax highlighting are data, not logic

import { useCallback, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, keymap, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { Prec, RangeSetBuilder, type Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

import { clickHouseCompletions } from "@/lib/clickhouse-completion";
import {
  quoteQueryIdentifier,
  type IdentifierDialect,
} from "@/lib/query-identifiers";
import { sqlCompletionSite } from "@/lib/sql-completion-scope";
import {
  isNativeCommandEngine,
  resolveWorksheetRunScope,
  sqlDialectForEngine,
  type WorksheetRunScope,
} from "@/lib/sql-run-scope";
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
  /** Read-only mode: no editing, no completion, no shortcuts, aria-readonly on root. */
  readOnly?: boolean;
  className?: string;
  themePreference?: QueryEditorThemePreference;
  height?: number;
  schemaNamespace?: SchemaNamespace;
  columnFetcher?: TableColumnFetcher;
  /** Reports what Run would execute (selection/current statement/document). */
  onRunScopeChange?: (scope: WorksheetRunScope) => void;
};

export function createSqlCompletionSource(
  ns: SchemaNamespace | undefined,
  fetcher: TableColumnFetcher | undefined,
  engine: string | undefined = "mysql",
): (ctx: CompletionContext) => CompletionResult | Promise<CompletionResult | null> | null {
  const normalizedEngine = engine?.trim().toLowerCase();
  const scopedDialect: IdentifierDialect | null =
    normalizedEngine === "postgresql"
      ? "postgresql"
      : normalizedEngine === "mysql"
        ? "mysql"
        : null;
  return (ctx: CompletionContext) => {
    if (scopedDialect !== null) {
      return scopedCompletion(ctx, ns, fetcher, scopedDialect);
    }
    const dotMatch = ctx.matchBefore(/[\w`]+\.[\w`]*/);
    if (dotMatch) {
      const lastDot = dotMatch.text.lastIndexOf(".");
      const prefix = dotMatch.text.slice(0, lastDot).replace(/`/g, "");
      const from = ctx.pos - (dotMatch.text.length - lastDot - 1);
      const stmt = parseActiveStatement(ctx.state, ctx.pos);
      const aliases = extractTableAliases(stmt);

      const tableName = aliases[prefix] ?? prefix;
      const loaded = ns?.loadedColumns?.[tableName];
      if (loaded) {
        return {
          from,
          options: loaded.map((col) => ({ label: col, type: "field" })),
          validFor: /[\w`]*/,
        };
      }

      if (!fetcher || !ns) {
        return { from, options: [], validFor: /[\w`]*/ };
      }

      return buildColumnCompletionsForDot(prefix, ns, fetcher, aliases).then(
        (cols) => ({
          from,
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

    const word = ctx.matchBefore(/[\w`]*/);
    if (!word || (word.text === "" && !ctx.explicit)) {
      return null;
    }

    return { from: word.from, options, validFor: /[\w`]*/ };
  };
}

// Scope-aware path for MySQL/PostgreSQL: bindings come from the Lezer tree,
// never from regex alias extraction. Unresolved or unscoped contexts stay
// silent on columns while keeping the plain catalog/keyword vocabulary.
function scopedCompletion(
  ctx: CompletionContext,
  ns: SchemaNamespace | undefined,
  fetcher: TableColumnFetcher | undefined,
  dialect: IdentifierDialect,
): CompletionResult | Promise<CompletionResult | null> | null {
  const word = ctx.matchBefore(/[\w$]*/);
  const site = sqlCompletionSite(
    ctx.state,
    ctx.pos,
    word?.from ?? ctx.pos,
    dialect,
  );
  if (!site) return null;
  const { scope, column } = site;
  if (column) {
    const binding = scope?.bindings.get(column.qualifier);
    if (!binding) return null;
    // CodeMirror matches the entire replacement range, including suffix text.
    // For mid-token edits only, match the prefix ourselves before replacing it.
    const midToken = column.to > ctx.pos;
    const prefix = ctx.state.sliceDoc(column.from, ctx.pos);
    const normalize = (text: string) =>
      column.quoted && dialect === "postgresql" ? text : text.toLowerCase();
    const typed = normalize(prefix);
    const columnsResult = (columns: readonly string[]): CompletionResult => ({
      from: column.from,
      to: column.to,
      ...(midToken ? { filter: false } : {}),
      options: columns.flatMap((name) => {
        const apply = quoteQueryIdentifier(name, dialect);
        const label = column.quoted ? apply : name;
        if (midToken && !normalize(label).startsWith(typed)) return [];
        return [{
          label,
          ...(column.quoted ? { displayLabel: name } : {}),
          type: "field",
          apply,
        }];
      }),
    });
    if (binding.kind === "local") {
      return columnsResult(binding.columns);
    }
    const loaded = ns?.loadedColumns;
    if (loaded && Object.hasOwn(loaded, binding.table)) {
      return columnsResult(loaded[binding.table]!);
    }
    if (!ns || !fetcher || ctx.aborted) return null;
    ctx.addEventListener("abort", () => {}, { onDocChange: true });
    return fetcher(binding.table)
      .then((cols) => (ctx.aborted ? null : columnsResult(cols)))
      .catch(() => null);
  }

  const options: import("@codemirror/autocomplete").Completion[] = [];
  if (ns) {
    options.push(...buildTableCompletions(ns));
    options.push(...buildDatabaseQualifiedCompletions(ns));
  }
  if (scope?.relationPosition && scope.ctes.size > 0) {
    const cteNames = [...scope.ctes.keys()];
    const shadowed = new Set(cteNames);
    const retained = options.filter(
      (option) =>
        (option.type !== "table" && option.type !== "view") ||
        !shadowed.has(String(option.label)),
    );
    options.length = 0;
    options.push(
      ...cteNames.map((cte) => ({
        label: cte,
        type: "table" as const,
        apply: quoteQueryIdentifier(cte, dialect),
      })),
      ...retained,
    );
  }
  options.push(...buildKeywordCompletions());
  if (!word || (word.text === "" && !ctx.explicit)) {
    return null;
  }
  return { from: word.from, options };
}

type ResolvedEditorTheme = Exclude<QueryEditorThemePreference, "system">;

const runScopeMark = Decoration.mark({ class: "cm-runscope" });

// Subtly marks the statement Run will execute when the editor holds ≥2
// statements and nothing is selected, and reports the resolved scope upward
// for the Run control's tooltip.
function runScopeExtension(
  engine: string | undefined,
  onScopeChange?: (scope: WorksheetRunScope) => void,
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      private lastScope: WorksheetRunScope | null = null;

      constructor(view: EditorView) {
        this.recompute(view);
      }

      update(update: ViewUpdate) {
        const reparsed = syntaxTree(update.state) !== syntaxTree(update.startState);
        if (update.docChanged || update.selectionSet || reparsed) {
          this.recompute(update.view);
        }
      }

      private recompute(view: EditorView) {
        const resolved = resolveWorksheetRunScope(view.state, engine);
        const builder = new RangeSetBuilder<Decoration>();
        const range = resolved.scope === "statement" ? resolved.statementRange : null;
        if (range && range.from < range.to) {
          builder.add(range.from, range.to, runScopeMark);
        }
        this.decorations = builder.finish();
        // Report after the update cycle: calling React state synchronously
        // inside a transaction can recurse through prop-driven view updates.
        if (onScopeChange && resolved.scope !== this.lastScope) {
          this.lastScope = resolved.scope;
          const scope = resolved.scope;
          queueMicrotask(() => onScopeChange(scope));
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
}

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
    ".cm-runscope": { backgroundColor: "rgba(37, 99, 235, 0.08)" },
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
    ".cm-runscope": { backgroundColor: "rgba(147, 197, 253, 0.12)" },
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
    ".cm-runscope": { backgroundColor: "rgba(250, 204, 21, 0.18)" },
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
  readOnly = false,
  className,
  themePreference = "system",
  height,
  schemaNamespace,
  columnFetcher,
  onRunScopeChange,
}: SqlCodeEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const resolvedTheme = resolveEditorTheme(themePreference);

  const handleCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
    onEditorView?.(view);
  }, [onEditorView]);

  const sqlCompletionSource = useCallback(
    (ctx: CompletionContext) => engine === "clickhouse"
      ? clickHouseCompletions(ctx, schemaNamespace)
      : createSqlCompletionSource(schemaNamespace, columnFetcher, engine)(ctx),
    [engine, schemaNamespace, columnFetcher],
  );

  const extensions = useMemo(() => {
    const nativeCommand = isNativeCommandEngine(engine);
    const extensions: Extension[] = [
      ...(nativeCommand ? [] : [sql({ dialect: sqlDialectForEngine(engine) })]),
      layoutTheme,
      syntaxThemes[resolvedTheme],
    ];

    if (!readOnly) {
      extensions.push(
        Prec.highest(
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
                if (!onFormat) return false;
                onFormat();
                return true;
              },
              preventDefault: true,
            },
          ]),
        ),
      );
    }
    if (!readOnly && !nativeCommand) {
      extensions.push(
        autocompletion({
          override: [sqlCompletionSource],
          activateOnTyping: true,
          defaultKeymap: true,
        }),
      );
    }
    if (!readOnly) {
      extensions.push(runScopeExtension(engine, onRunScopeChange));
    }

    extensions.push(
      EditorView.contentAttributes.of({
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        tabindex: disabled ? "-1" : "0",
      }),
    );

    if (readOnly) {
      extensions.push(EditorView.editorAttributes.of({ "aria-readonly": "true" }));
    }

    return extensions;
  }, [engine, onRun, onFormat, resolvedTheme, sqlCompletionSource, ariaLabel, readOnly, disabled, onRunScopeChange]);

  return (
    <CodeMirror
      value={value}
      height={height === undefined ? "220px" : `${height}px`}
      className={cn("text-sm", className)}
      theme={editorThemes[resolvedTheme]}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={handleCreateEditor}
      editable={!disabled && !readOnly}
      readOnly={disabled || readOnly}
      aria-label={ariaLabel}
      basicSetup={{
        lineNumbers: !readOnly,
        foldGutter: !readOnly,
        highlightActiveLine: !readOnly,
        bracketMatching: true,
        closeBrackets: !readOnly,
        autocompletion: false,
      }}
    />
  );
}
