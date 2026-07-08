"use client";

import { useCallback, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, MySQL, StandardSQL } from "@codemirror/lang-sql";
import { keymap, type EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";

import { cn } from "@/lib/utils";

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
};

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
}: SqlCodeEditorProps) {
  const viewRef = useRef<EditorView | null>(null);

  const handleCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
    onEditorView?.(view);
  }, [onEditorView]);

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

    return [sql({ dialect }), shortcuts];
  }, [engine, onRun, onFormat]);

  return (
    <CodeMirror
      value={value}
      minHeight="220px"
      className={cn("text-sm", className)}
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
