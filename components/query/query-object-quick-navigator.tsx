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
import { type QuerySchemaStore, useSchemaCatalogVersion } from "@/lib/query-schema-store";
import type { ObjectSummary } from "@/types/query-schema";

const PAGE_SIZE = 50;

type QueryObjectQuickNavigatorProps = {
  readonly catalog: QuerySchemaStore;
  readonly targetId: number;
  readonly activeDatabase: string | null;
  readonly onDatabaseSelect: (database: string) => void;
  readonly onRevealObject?: (object: ObjectSummary) => void;
  readonly onInsertObject: (object: Pick<ObjectSummary, "database" | "name">) => void;
};

export function QueryObjectQuickNavigator({
  catalog,
  targetId,
  activeDatabase,
  onDatabaseSelect,
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

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void catalog.ensureDatabases(targetId, { page: 1, pageSize: PAGE_SIZE, replace: true, signal: controller.signal });
    return () => controller.abort();
  }, [catalog, open, targetId]);

  useEffect(() => {
    if (!open || !activeDatabase) return;
    const controller = new AbortController();
    void catalog.ensureObjects(targetId, activeDatabase, {
      q: query || undefined,
      page: 1,
      pageSize: PAGE_SIZE,
      replace: true,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [activeDatabase, catalog, open, query, targetId]);

  const databases = catalog.getDatabases(targetId, PAGE_SIZE);
  const objects = activeDatabase
    ? catalog.getObjects(targetId, activeDatabase, PAGE_SIZE, query)
    : { items: [], status: "idle" as const };
  const error = databases.status === "error" || objects.status === "error";
  const options = [
    ...databases.items
      .filter((database) => database.includes(query))
      .map((database) => ({ kind: "database" as const, database })),
    ...objects.items.map((object) => ({ kind: "object" as const, object })),
  ];

  function activate() {
    const option = options[activeIndex];
    if (!option) return;
    if (option.kind === "database") onDatabaseSelect(option.database);
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
            ) : (
              <div key={`${option.object.kind}-${option.object.name}`} className="flex items-center justify-between">
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
