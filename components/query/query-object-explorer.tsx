"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { QueryObjectTree } from "@/components/query/query-object-tree";
import { QuerySchemaStore } from "@/lib/query-schema-store";
import { getObjectDetails, getSchemaDatabases, getSchemaObjects } from "@/services/query-schema";
import type { ObjectDetailResponse, ObjectSummary } from "@/types/query-schema";

const PAGE_SIZE = 25;
const MAX_OBJECTS = 500;

type QueryObjectExplorerProps = { readonly targetId: number; readonly store: QuerySchemaStore };

export function QueryObjectExplorer({ targetId, store }: QueryObjectExplorerProps) {
  const t = useTranslations("queryWorkbench");
  const [databases, setDatabases] = useState<readonly string[]>([]);
  const [objects, setObjects] = useState<ReadonlyMap<string, readonly ObjectSummary[]>>(new Map());
  const [details, setDetails] = useState<ReadonlyMap<string, ObjectDetailResponse>>(new Map());
  const [expandedDatabases, setExpandedDatabases] = useState<ReadonlySet<string>>(new Set());
  const [expandedObjects, setExpandedObjects] = useState<ReadonlySet<string>>(new Set());
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [loadingObjects, setLoadingObjects] = useState<ReadonlySet<string>>(new Set());
  const [loadingDetails, setLoadingDetails] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestGeneration = generation.current + 1;
    generation.current = requestGeneration;
    startTransition(() => {
      setLoadingDatabases(true);
      setError(false);
      setDatabases([]);
      setObjects(new Map());
      setDetails(new Map());
    });
    void getSchemaDatabases(targetId, { page: 1, pageSize: PAGE_SIZE, signal: controller.signal }).then(
      (response) => { if (!controller.signal.aborted && requestGeneration === generation.current) setDatabases(response.items.map((database) => database.name)); },
      () => { if (!controller.signal.aborted && requestGeneration === generation.current) setError(true); },
    ).finally(() => { if (!controller.signal.aborted && requestGeneration === generation.current) setLoadingDatabases(false); });
    return () => controller.abort();
  }, [targetId]);

  function toggleDatabase(database: string) {
    const next = new Set(expandedDatabases); next.has(database) ? next.delete(database) : next.add(database); setExpandedDatabases(next);
    if (next.has(database) && !objects.has(database)) {
      const controller = new AbortController(); setLoadingObjects((previous) => new Set(previous).add(database));
      void getSchemaObjects(targetId, { database, page: 1, pageSize: PAGE_SIZE, signal: controller.signal }).then((response) => {
        if (!controller.signal.aborted) setObjects((previous) => new Map(previous).set(database, response.items.slice(0, MAX_OBJECTS)));
      }, () => { /* swallow — error state is not tracked per-database */ }).finally(() => { if (!controller.signal.aborted) setLoadingObjects((previous) => { const copy = new Set(previous); copy.delete(database); return copy; }); });
    }
  }

  function toggleObject(object: ObjectSummary) {
    if (!object.database) return;
    const key = `${object.database}:${object.kind}:${object.name}`; const next = new Set(expandedObjects); next.has(key) ? next.delete(key) : next.add(key); setExpandedObjects(next);
    if (next.has(key) && !details.has(key)) {
      const storeKey = { targetId, database: object.database, kind: object.kind, name: object.name }; store.setDetailLoading(storeKey); setLoadingDetails((previous) => new Set(previous).add(key));
      void getObjectDetails(targetId, { database: object.database, name: object.name, kind: object.kind }).then((detail) => { store.setDetail(storeKey, detail); setDetails((previous) => new Map(previous).set(key, detail)); }, () => { store.setEmptyDetail(storeKey); }).finally(() => setLoadingDetails((previous) => { const copy = new Set(previous); copy.delete(key); return copy; }));
    }
  }

  if (loadingDatabases) return <p className="p-4 text-sm text-muted-foreground">{t("schema.loading")}</p>;
  if (error) return <div className="space-y-2 p-4"><p className="text-sm text-destructive">{t("schema.loadError")}</p><Button variant="outline" size="sm" onClick={() => { generation.current++; setLoadingDatabases(true); }}>{t("schema.retry")}</Button></div>;
  if (databases.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("schema.noDatabases")}</p>;
  return <QueryObjectTree databases={databases} expandedDatabases={expandedDatabases} expandedObjects={expandedObjects} objectsByDatabase={objects} loadingDatabases={loadingObjects} loadingObjects={loadingDetails} onDatabaseToggle={toggleDatabase} onObjectToggle={toggleObject} renderDetail={(object) => {
    const detail = details.get(`${object.database}:${object.kind}:${object.name}`); if (!detail) return null;
    return <div className="space-y-2 text-xs text-muted-foreground"><p>{t("schema.detailColumns", { count: detail.columns.length })}</p><p>{t("schema.detailKeys", { count: detail.columns.filter((column) => column.primaryKey).length })}</p><p>{t("schema.detailIndexes", { count: detail.indexes.length })}</p><p>{t("schema.detailForeignKeys", { count: detail.foreignKeys.length })}</p></div>;
  }} />;
}
