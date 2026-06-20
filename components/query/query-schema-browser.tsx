"use client";

import { useTranslations } from "next-intl";
import { Database, Folder, Lock } from "lucide-react";

import type {
  QueryKind,
  QueryTarget,
  QueryTargetSchemaPreviewNode,
} from "@/types/query-target";
import { cn } from "@/lib/utils";

type QuerySchemaBrowserProps = {
  target: QueryTarget;
};

export function QuerySchemaBrowser({ target }: QuerySchemaBrowserProps) {
  const t = useTranslations("queryWorkbench");
  const nodes = target.schemaPreview;
  const hasSchema = nodes.length > 0;

  return (
    <aside
      aria-label={t("schema.title")}
      className="flex min-w-0 flex-col rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border p-3">
        <h2 className="text-sm font-semibold text-foreground">{t("schema.title")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("schema.subtitle")}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {hasSchema ? (
          <ul role="tree" className="space-y-0.5">
            {nodes.map((node, index) => (
              <SchemaNode
                key={`${node.kind}-${node.name}-${index}`}
                node={node}
                depth={0}
              />
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {placeholderText(target.capability.queryKind)}
            </p>
            <p className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              {t("schema.locked")}
            </p>
          </div>
        )}
      </div>
    </aside>
  );

  function placeholderText(kind: QueryKind): string {
    switch (kind) {
      case "sql":
        return t("schema.placeholderSql");
      case "redis":
        return t("schema.placeholderRedis");
      case "mongo":
        return t("schema.placeholderMongo");
      default:
        return t("schema.placeholderDefault");
    }
  }
}

function SchemaNode({
  node,
  depth,
}: {
  node: QueryTargetSchemaPreviewNode;
  depth: number;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const Icon = hasChildren ? Folder : Database;

  return (
    <li role="treeitem" aria-label={node.name} aria-selected={false}>
      <span
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground",
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="truncate font-medium text-foreground">{node.name}</span>
        <span className="rounded bg-muted px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {node.kind}
        </span>
      </span>
      {hasChildren ? (
        <ul role="group" className="space-y-0.5">
          {node.children!.map((child, index) => (
            <SchemaNode
              key={`${child.kind}-${child.name}-${index}`}
              node={child}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
