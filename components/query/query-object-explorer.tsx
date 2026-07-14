"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { QueryObjectInspector } from "@/components/query/query-object-inspector";
import { QueryObjectTree } from "@/components/query/query-object-tree";
import { QuerySchemaStore } from "@/lib/query-schema-store";
import { getObjectDetails, getSchemaDatabases, getSchemaObjects } from "@/services/query-schema";
import type { ObjectDetailResponse, ObjectSummary } from "@/types/query-schema";
import type { TablePreviewRequest } from "@/types/query-execution";

const PAGE_SIZE = 25;
const MAX_OBJECTS = 500;

type DetailViewState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly detail: ObjectDetailResponse }
  | { readonly status: "error" };

type QueryObjectExplorerProps = {
  readonly targetId: number;
  readonly store: QuerySchemaStore;
  readonly onPreviewRequest?: (request: TablePreviewRequest) => void;
};

export function QueryObjectExplorer({ targetId, store, onPreviewRequest }: QueryObjectExplorerProps) {
  const t = useTranslations("queryWorkbench");
  const [databases, setDatabases] = useState<readonly string[]>([]);
  const [objects, setObjects] = useState<ReadonlyMap<string, readonly ObjectSummary[]>>(new Map());
  const [details, setDetails] = useState<ReadonlyMap<string, DetailViewState>>(new Map());
  const [expandedDatabases, setExpandedDatabases] = useState<ReadonlySet<string>>(new Set());
  const [expandedObjects, setExpandedObjects] = useState<ReadonlySet<string>>(new Set());
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [loadingObjects, setLoadingObjects] = useState<ReadonlySet<string>>(new Set());
  const [loadingDetails, setLoadingDetails] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const [inspectorKey, setInspectorKey] = useState<string | null>(null);
  const [inspectorDetail, setInspectorDetail] = useState<ObjectDetailResponse | null>(null);
  const inspectTriggerRef = useRef<HTMLButtonElement>(null);

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
      setExpandedDatabases(new Set());
      setExpandedObjects(new Set());
      setLoadingObjects(new Set());
      setLoadingDetails(new Set());
      setInspectorKey(null);
      setInspectorDetail(null);
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
      const controller = new AbortController();
      const requestGeneration = generation.current;
      setLoadingObjects((previous) => new Set(previous).add(database));
      void getSchemaObjects(targetId, { database, page: 1, pageSize: PAGE_SIZE, signal: controller.signal }).then((response) => {
        if (!controller.signal.aborted && requestGeneration === generation.current) setObjects((previous) => new Map(previous).set(database, response.items.slice(0, MAX_OBJECTS)));
      }, () => { /* swallow — error state is not tracked per-database */ }).finally(() => { if (!controller.signal.aborted && requestGeneration === generation.current) setLoadingObjects((previous) => { const copy = new Set(previous); copy.delete(database); return copy; }); });
    }
  }

  function loadObjectDetail(object: ObjectSummary) {
    if (!object.database) return;
    const key = `${object.database}:${object.kind}:${object.name}`;
    if (inspectorKey === key) {
      setInspectorKey(null);
      setInspectorDetail(null);
    }
    const storeKey = { targetId, database: object.database, kind: object.kind, name: object.name };
    const requestGeneration = generation.current;
    const controller = new AbortController();
    store.setDetailLoading(storeKey);
    setLoadingDetails((previous) => new Set(previous).add(key));
    setDetails((previous) => new Map(previous).set(key, { status: "loading" }));
    void getObjectDetails(targetId, { database: object.database, name: object.name, kind: object.kind, signal: controller.signal }).then(
      (detail) => {
        if (!controller.signal.aborted && requestGeneration === generation.current) {
          store.setDetail(storeKey, detail);
          setDetails((previous) => new Map(previous).set(key, { status: "ready", detail }));
        }
      },
      () => {
        if (!controller.signal.aborted && requestGeneration === generation.current) {
          store.setEmptyDetail(storeKey);
          setDetails((previous) => new Map(previous).set(key, { status: "error" }));
        }
      },
    ).finally(() => {
      if (!controller.signal.aborted && requestGeneration === generation.current) {
        setLoadingDetails((previous) => {
          const copy = new Set(previous);
          copy.delete(key);
          return copy;
        });
      }
    });
  }

  function toggleObject(object: ObjectSummary) {
    if (!object.database) return;
    const key = `${object.database}:${object.kind}:${object.name}`;
    const next = new Set(expandedObjects);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpandedObjects(next);
    if (!next.has(key) && inspectorKey === key) {
      setInspectorKey(null);
      setInspectorDetail(null);
    }
    if (next.has(key) && !details.has(key)) {
      loadObjectDetail(object);
    }
  }

  const closeInspector = useCallback(() => {
    setInspectorKey(null);
    setInspectorDetail(null);
  }, []);

  if (loadingDatabases) return <p className="p-4 text-sm text-muted-foreground">{t("schema.loading")}</p>;
  if (error) return <div className="space-y-2 p-4"><p className="text-sm text-destructive">{t("schema.loadError")}</p><Button variant="outline" size="sm" onClick={() => { generation.current++; setLoadingDatabases(true); }}>{t("schema.retry")}</Button></div>;
  if (databases.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("schema.noDatabases")}</p>;
  return (
    <>
      <QueryObjectTree databases={databases} expandedDatabases={expandedDatabases} expandedObjects={expandedObjects} objectsByDatabase={objects} loadingDatabases={loadingObjects} loadingObjects={loadingDetails} onDatabaseToggle={toggleDatabase} onObjectToggle={toggleObject} renderDetail={(object) => {
        const state = details.get(`${object.database}:${object.kind}:${object.name}`);
        if (!state || state.status === "loading") return null;
        if (state.status === "error") {
          return (
            <div className="space-y-2 text-xs">
              <p className="text-destructive">{t("schema.detailLoadError")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => loadObjectDetail(object)}>
                {t("schema.retry")}
              </Button>
            </div>
          );
        }
        const columns = state.detail.columns ?? [];
        const indexes = state.detail.indexes ?? [];
        const foreignKeys = state.detail.foreignKeys ?? [];
        const isTable = object.kind === "table";
        const foreignKeysTruncated = state.detail.truncated?.foreignKeys ?? true;
        const objectKey = `${object.database}:${object.kind}:${object.name}`;
        return (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>{t("schema.detailColumns", { count: columns.length })}</p>
            <p>{t("schema.detailKeys", { count: columns.filter((column) => column.primaryKey).length })}</p>
            <p>{t("schema.detailIndexes", { count: indexes.length })}</p>
            <p>{t("schema.detailForeignKeys", { count: foreignKeys.length })}</p>
            <div className="flex gap-2">
              <Button
                ref={inspectorKey === objectKey ? inspectTriggerRef : undefined}
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                data-testid="inspect-button"
                onClick={() => {
                  setInspectorKey(objectKey);
                  setInspectorDetail(state.detail);
                }}
              >
                {t("schema.inspect")}
              </Button>
              {isTable && onPreviewRequest && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() =>
                    onPreviewRequest({
                      targetId,
                      database: object.database,
                      table: object.name,
                      kind: "table",
                      foreignKeys,
                      foreignKeysTruncated,
                    })
                  }
                >
                  {t("schema.previewRows")}
                </Button>
              )}
            </div>
          </div>
        );
      }} />
      {inspectorDetail && (
        <QueryObjectInspector
          open={inspectorKey !== null}
          onClose={closeInspector}
          detail={inspectorDetail}
          triggerRef={inspectTriggerRef}
        />
      )}
    </>
  );
}
