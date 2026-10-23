// input: @/lib/schema-catalog, query-schema types
// output: Cmd+P quick navigator reading schema catalog
// pos: UI adapter over schema catalog for bounded database/object search
// note: if this file changes, update header and components/query/README.md
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type SchemaCatalog, useSchemaCatalogVersion } from "@/lib/schema-catalog";
import type { ObjectSummary } from "@/types/query-schema";
import type { QueryTargetConnection } from "@/types/query-target";

const PAGE_SIZE = 50;

type QueryObjectQuickNavigatorProps = {
  readonly catalog: SchemaCatalog;
  readonly targetId: number;
  readonly activeDatabase: string | null;
  /** PostgreSQL namespace pin; null/undefined means the connection default. */
  readonly activeSchema?: string | null;
  /** Composite connections for PostgreSQL targets (enumerates databases). */
  readonly connections?: readonly QueryTargetConnection[];
  readonly onDatabaseSelect: (database: string) => void;
  /** PostgreSQL only: pin a namespace of the selected connection. */
  readonly onSchemaSelect?: (schema: string) => void;
  readonly onRevealObject?: (object: ObjectSummary) => void;
  readonly onInsertObject: (
    object: Pick<ObjectSummary, "database" | "name" | "schema">,
  ) => void;
};

export function QueryObjectQuickNavigator({
  catalog,
  targetId,
  activeDatabase,
  activeSchema,
  connections,
  onDatabaseSelect,
  onSchemaSelect,
  onRevealObject,
  onInsertObject,
}: QueryObjectQuickNavigatorProps) {
  const pathname = usePathname();
  const t = useTranslations("queryWorkbench.navigator");
  useSchemaCatalogVersion(catalog);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (pathname !== "/query" || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname]);

  const isPostgres = (connections?.length ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    if (isPostgres) return;
    const controller = new AbortController();
    void catalog.ensureDatabases(targetId, { page: 1, pageSize: PAGE_SIZE, replace: true, signal: controller.signal });
    return () => controller.abort();
  }, [catalog, isPostgres, open, targetId]);

  // PostgreSQL: once a connection is active, load its namespaces so the
  // navigator can pin a schema; objects then load under the resolved schema.
  useEffect(() => {
    if (!open || !isPostgres || !activeDatabase) return;
    const controller = new AbortController();
    void catalog.ensureSchemas(targetId, activeDatabase, { signal: controller.signal });
    return () => controller.abort();
  }, [activeDatabase, catalog, isPostgres, open, targetId]);

  useEffect(() => {
    if (!open || !activeDatabase) return;
    const controller = new AbortController();
    void catalog.ensureObjects(targetId, activeDatabase, {
      ...(isPostgres && activeSchema ? { schema: activeSchema } : {}),
      q: query || undefined,
      page: 1,
      pageSize: PAGE_SIZE,
      replace: true,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [activeDatabase, activeSchema, catalog, isPostgres, open, query, targetId]);

  const databases = isPostgres
    ? {
        items: (connections ?? []).map((row) => row.database),
        status: "ready" as const,
      }
    : catalog.getDatabases(targetId, PAGE_SIZE);
  const schemas =
    isPostgres && activeDatabase ? catalog.getSchemas(targetId, activeDatabase) : null;
  const objects = activeDatabase
    ? catalog.getObjects(
        targetId,
        activeDatabase,
        PAGE_SIZE,
        query,
        isPostgres ? (activeSchema ?? "") : "",
      )
    : { items: [], status: "idle" as const };
  const error =
    databases.status === "error" ||
    objects.status === "error" ||
    schemas?.status === "error";
  const options = [
    ...databases.items
      .filter((database) => database.includes(query))
      .map((database) => ({ kind: "database" as const, database })),
    ...(schemas?.items ?? [])
      .filter((schema) => schema.includes(query))
      .map((schema) => ({ kind: "schema" as const, schema })),
    ...objects.items.map((object) => ({ kind: "object" as const, object })),
  ];

  function activate() {
    const option = options[activeIndex];
    if (!option) return;
    if (option.kind === "database") onDatabaseSelect(option.database);
    else if (option.kind === "schema") onSchemaSelect?.(option.schema);
    else onRevealObject?.(option.object);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-label={t("title")}>
        <DialogTitle>{t("title")}</DialogTitle>
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              activate();
            }
          }}
          aria-label={t("search")}
          className="w-full rounded-md border border-input px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error ? (
          <Button
            onClick={() => {
              setOpen(false);
              setTimeout(() => setOpen(true));
            }}
          >
            {t("retry")}
          </Button>
        ) : null}
        <div role="listbox">
          {options.map((option, index) =>
            option.kind === "database" ? (
              <Button
                key={option.database}
                variant="ghost"
                className="w-full justify-start"
                aria-selected={index === activeIndex}
                onClick={() => onDatabaseSelect(option.database)}
              >
                {option.database}
              </Button>
            ) : option.kind === "schema" ? (
              <Button
                key={option.schema}
                variant="ghost"
                className="w-full justify-start pl-6"
                aria-selected={index === activeIndex}
                onClick={() => onSchemaSelect?.(option.schema)}
              >
                {option.schema}
              </Button>
            ) : (
              <div key={`${option.object.schema ?? ""}-${option.object.kind}-${option.object.name}`} className="flex items-center justify-between">
                <Button variant="ghost" aria-selected={index === activeIndex} onClick={() => onRevealObject?.(option.object)}>
                  {option.object.name}
                </Button>
                <Button size="sm" onClick={() => onInsertObject(option.object)}>
                  {t("insert")}
                </Button>
              </div>
            ),
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
