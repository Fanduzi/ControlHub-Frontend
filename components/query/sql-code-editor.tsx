"use client";

import dynamic from "next/dynamic";

import type { SqlCodeEditorProps } from "@/components/query/sql-code-editor-client";

const SqlCodeEditorClient = dynamic(
  () =>
    import("@/components/query/sql-code-editor-client").then(
      (mod) => mod.SqlCodeEditorClient,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[220px] rounded-lg border border-border bg-muted/20 p-3 font-mono text-sm text-muted-foreground">
        Loading SQL editor...
      </div>
    ),
  },
);

export function SqlCodeEditor(props: SqlCodeEditorProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <SqlCodeEditorClient {...props} />
    </div>
  );
}

export type { SqlCodeEditorProps };
