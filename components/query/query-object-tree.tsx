"use client";

import { ChevronRight, Database, Table2, View } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { ObjectSummary } from "@/types/query-schema";

type QueryObjectTreeProps = {
  readonly databases: readonly string[];
  readonly expandedDatabases: ReadonlySet<string>;
  readonly expandedObjects: ReadonlySet<string>;
  readonly objectsByDatabase: ReadonlyMap<string, readonly ObjectSummary[]>;
  readonly loadingDatabases: ReadonlySet<string>;
  readonly loadingObjects: ReadonlySet<string>;
  readonly onDatabaseToggle: (database: string) => void;
  readonly onObjectToggle: (object: ObjectSummary) => void;
  readonly renderDetail: (object: ObjectSummary) => React.ReactNode;
};

export function QueryObjectTree({
  databases,
  expandedDatabases,
  expandedObjects,
  objectsByDatabase,
  loadingDatabases,
  loadingObjects,
  onDatabaseToggle,
  onObjectToggle,
  renderDetail,
}: QueryObjectTreeProps) {
  const t = useTranslations("queryWorkbench");
  return (
    <ul role="tree" className="space-y-1">
      {databases.map((database) => {
        const expanded = expandedDatabases.has(database);
        const objects = objectsByDatabase.get(database) ?? [];
        return (
          <li key={database} role="treeitem" aria-expanded={expanded}>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => onDatabaseToggle(database)}>
              <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
              <Database className="size-3.5 text-primary" aria-hidden />
              <span className="truncate">{database}</span>
            </Button>
            {expanded ? (
              <ul role="group" className="ml-4 border-l border-border pl-2">
                {loadingDatabases.has(database) ? <li className="py-2 text-xs text-muted-foreground">{t("schema.loading")}</li> : null}
                {(["table", "view"] as const).map((kind) => {
                  const group = objects.filter((object) => object.kind === kind);
                  if (group.length === 0) return null;
                  const Icon = kind === "table" ? Table2 : View;
                  return (
                    <li key={kind} role="treeitem" aria-label={kind === "table" ? t("schema.tables") : t("schema.views")}>
                      <p className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground"><Icon className="size-3" aria-hidden />{kind === "table" ? t("schema.tables") : t("schema.views")}</p>
                      <ul role="group">
                        {group.map((object) => {
                          const key = `${object.database}:${object.kind}:${object.name}`;
                          const objectExpanded = expandedObjects.has(key);
                          return (
                            <li key={key} role="treeitem" aria-expanded={objectExpanded}>
                              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => onObjectToggle(object)}>
                                <ChevronRight className={`size-3 transition-transform ${objectExpanded ? "rotate-90" : ""}`} aria-hidden />
                                <span className="truncate">{object.name}</span>
                              </Button>
                              {objectExpanded ? <div className="ml-5 py-1">{loadingObjects.has(key) ? <p className="text-xs text-muted-foreground">{t("schema.loading")}</p> : renderDetail(object)}</div> : null}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
