// input: @/lib/schema-catalog, @/components/query/query-object-tree, query-schema fetch via catalog
// output: QueryObjectExplorer (tree + inspector) reading schema catalog
// pos: object explorer UI adapter over schema catalog
// note: if this file changes, update header and components/query/README.md
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { QueryObjectInspector } from "@/components/query/query-object-inspector";
import { QueryObjectTree, type ObjectListingState } from "@/components/query/query-object-tree";
import { Button } from "@/components/ui/button";
import { objectIdentityKey, objectKeyBelongsToDatabase } from "@/lib/query-object-identity";
import { QuerySchemaStore, useSchemaCatalogVersion } from "@/lib/query-schema-store";
import type { ObjectDetailResponse, ObjectSummary } from "@/types/query-schema";
import type { TablePreviewRequest } from "@/types/query-execution";

const PAGE_SIZE = 25;

type QueryState = {
  readonly draft: string;
  readonly submitted: string;
};

type QueryObjectExplorerProps = {
  readonly targetId: number;
  readonly store: QuerySchemaStore;
  readonly onPreviewRequest?: (request: TablePreviewRequest) => void;
};

export function QueryObjectExplorer({ targetId, store, onPreviewRequest }: QueryObjectExplorerProps) {
  const t = useTranslations("queryWorkbench");
  useSchemaCatalogVersion(store);

  const [expandedDatabases, setExpandedDatabases] = useState<ReadonlySet<string>>(new Set());
  const [expandedObjects, setExpandedObjects] = useState<ReadonlySet<string>>(new Set());
  const [queries, setQueries] = useState<ReadonlyMap<string, QueryState>>(new Map());
  const [inspectorKey, setInspectorKey] = useState<string | null>(null);
  const [inspectorDetail, setInspectorDetail] = useState<ObjectDetailResponse | null>(null);
  const [inspectTriggerElement, setInspectTriggerElement] = useState<HTMLButtonElement | null>(null);
  const [databaseDraftQuery, setDatabaseDraftQuery] = useState("");
  const [databaseQuery, setDatabaseQuery] = useState("");
  const [includeSystem, setIncludeSystem] = useState(false);
  const [seenTargetId, setSeenTargetId] = useState(targetId);
  if (seenTargetId !== targetId) {
    setSeenTargetId(targetId);
    setExpandedDatabases(new Set());
    setExpandedObjects(new Set());
    setQueries(new Map());
    setInspectorKey(null);
    setInspectorDetail(null);
    setInspectTriggerElement(null);
    setDatabaseDraftQuery("");
    setDatabaseQuery("");
    setIncludeSystem(false);
  }

  const databaseController = useRef<AbortController | null>(null);
  const databaseSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectControllers = useRef(new Map<string, AbortController>());
  const detailControllers = useRef(new Map<string, AbortController>());
  const objectSearchTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inspectorKeyRef = useRef<string | null>(null);

  useEffect(() => {
    inspectorKeyRef.current = inspectorKey;
  }, [inspectorKey]);

  const abortAllRequests = useCallback(() => {
    if (databaseSearchTimer.current) clearTimeout(databaseSearchTimer.current);
    databaseSearchTimer.current = null;
    databaseController.current?.abort();
    databaseController.current = null;
    for (const timer of objectSearchTimers.current.values()) clearTimeout(timer);
    objectSearchTimers.current.clear();
    for (const controller of objectControllers.current.values()) controller.abort();
    objectControllers.current.clear();
    for (const controller of detailControllers.current.values()) controller.abort();
    detailControllers.current.clear();
  }, []);

  const cancelDatabaseWork = useCallback(() => {
    if (databaseSearchTimer.current) clearTimeout(databaseSearchTimer.current);
    databaseSearchTimer.current = null;
    databaseController.current?.abort();
    databaseController.current = null;
  }, []);

  const startDatabaseRequest = useCallback(
    ({
      page,
      replace,
      query,
      includeSystem: nextIncludeSystem,
      refresh = false,
    }: {
      readonly page: number;
      readonly replace: boolean;
      readonly query: string;
      readonly includeSystem: boolean;
      readonly refresh?: boolean;
    }) => {
      databaseController.current?.abort();
      const controller = new AbortController();
      databaseController.current = controller;
      void store.ensureDatabases(targetId, {
        page,
        pageSize: PAGE_SIZE,
        replace,
        ...(query ? { q: query } : {}),
        ...(nextIncludeSystem ? { includeSystem: true } : {}),
        ...(refresh ? { refresh: true } : {}),
        signal: controller.signal,
      });
    },
    [store, targetId],
  );

  useEffect(() => {
    abortAllRequests();
    startDatabaseRequest({ page: 1, replace: true, query: "", includeSystem: false });
    return abortAllRequests;
  }, [abortAllRequests, startDatabaseRequest, targetId]);

  const cancelObjectWork = useCallback((database: string) => {
    const timer = objectSearchTimers.current.get(database);
    if (timer) {
      clearTimeout(timer);
      objectSearchTimers.current.delete(database);
    }
    objectControllers.current.get(database)?.abort();
    objectControllers.current.delete(database);
  }, []);

  const invalidateDatabaseObjectUi = useCallback((database: string) => {
    setExpandedObjects((previous) => {
      const next = new Set(previous);
      for (const key of previous) {
        if (objectKeyBelongsToDatabase(key, database)) next.delete(key);
      }
      return next;
    });
    if (inspectorKeyRef.current && objectKeyBelongsToDatabase(inspectorKeyRef.current, database)) {
      setInspectorKey(null);
      setInspectorDetail(null);
      setInspectTriggerElement(null);
    }
  }, []);

  const startObjectRequest = useCallback(
    (
      database: string,
      submittedQuery: string,
      page: number,
      replace: boolean,
      refresh = false,
    ) => {
      objectControllers.current.get(database)?.abort();
      const controller = new AbortController();
      objectControllers.current.set(database, controller);
      if (replace) invalidateDatabaseObjectUi(database);
      void store.ensureObjects(targetId, database, {
        q: submittedQuery || undefined,
        page,
        pageSize: PAGE_SIZE,
        replace,
        ...(refresh ? { refresh: true } : {}),
        signal: controller.signal,
      });
    },
    [invalidateDatabaseObjectUi, store, targetId],
  );

  const loadObjectDetail = useCallback(
    (object: ObjectSummary, refresh = false) => {
      if (!object.database) return;
      const key = objectIdentityKey(object);
      if (inspectorKey === key) {
        setInspectorKey(null);
        setInspectorDetail(null);
        setInspectTriggerElement(null);
      }
      detailControllers.current.get(key)?.abort();
      const controller = new AbortController();
      detailControllers.current.set(key, controller);
      void store.ensureDetail(
        { targetId, database: object.database, kind: object.kind, name: object.name },
        controller.signal,
        refresh,
      );
    },
    [inspectorKey, store, targetId],
  );

  const toggleDatabase = useCallback(
    (database: string) => {
      const next = new Set(expandedDatabases);
      if (next.has(database)) {
        cancelObjectWork(database);
        next.delete(database);
      } else {
        next.add(database);
        const submitted = queries.get(database)?.submitted ?? "";
        const listing = store.getObjects(targetId, database, PAGE_SIZE, submitted);
        if (listing.status === "idle") {
          startObjectRequest(database, submitted, 1, true);
        }
      }
      setExpandedDatabases(next);
    },
    [cancelObjectWork, expandedDatabases, queries, startObjectRequest, store, targetId],
  );

  const toggleObject = useCallback(
    (object: ObjectSummary) => {
      if (!object.database) return;
      const key = objectIdentityKey(object);
      const next = new Set(expandedObjects);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setExpandedObjects(next);
      if (!next.has(key) && inspectorKey === key) {
        setInspectorKey(null);
        setInspectorDetail(null);
        setInspectTriggerElement(null);
      }
      if (next.has(key)) {
        const state = store.getDetailState({
          targetId,
          database: object.database,
          kind: object.kind,
          name: object.name,
        });
        if (state.status === "idle" || state.status === "stale") loadObjectDetail(object);
      }
    },
    [expandedObjects, inspectorKey, loadObjectDetail, store, targetId],
  );

  const closeInspector = useCallback(() => {
    const trigger = inspectTriggerElement;
    setInspectorKey(null);
    setInspectorDetail(null);
    setInspectTriggerElement(null);
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  }, [inspectTriggerElement]);

  const updateDraftQuery = useCallback((database: string, draft: string) => {
    cancelObjectWork(database);
    setQueries((previous) => {
      const next = new Map(previous);
      const current = next.get(database) ?? { draft: "", submitted: "" };
      next.set(database, { ...current, draft });
      return next;
    });
  }, [cancelObjectWork]);

  const searchObjects = useCallback(
    (database: string, query: string) => {
      const submitted = query.trim();
      cancelObjectWork(database);
      const timer = setTimeout(() => {
        objectSearchTimers.current.delete(database);
        setQueries((previous) => {
          const next = new Map(previous);
          next.set(database, { draft: query, submitted });
          return next;
        });
        startObjectRequest(database, submitted, 1, true);
      }, 250);
      objectSearchTimers.current.set(database, timer);
    },
    [cancelObjectWork, startObjectRequest],
  );

  const clearSearch = useCallback(
    (database: string) => {
      cancelObjectWork(database);
      setQueries((previous) => {
        const next = new Map(previous);
        next.set(database, { draft: "", submitted: "" });
        return next;
      });
      startObjectRequest(database, "", 1, true);
    },
    [cancelObjectWork, startObjectRequest],
  );

  const searchDatabases = useCallback((draftQuery: string) => {
    setDatabaseDraftQuery(draftQuery);
    cancelDatabaseWork();
    databaseSearchTimer.current = setTimeout(() => {
      databaseSearchTimer.current = null;
      const query = draftQuery.trim();
      setDatabaseQuery(query);
      startDatabaseRequest({ page: 1, replace: true, query, includeSystem });
    }, 250);
  }, [cancelDatabaseWork, includeSystem, startDatabaseRequest]);

  const clearDatabaseSearch = useCallback(() => {
    cancelDatabaseWork();
    setDatabaseDraftQuery("");
    setDatabaseQuery("");
    startDatabaseRequest({ page: 1, replace: true, query: "", includeSystem });
  }, [cancelDatabaseWork, includeSystem, startDatabaseRequest]);

  const toggleIncludeSystem = useCallback((nextIncludeSystem: boolean) => {
    cancelDatabaseWork();
    const query = databaseDraftQuery.trim();
    setIncludeSystem(nextIncludeSystem);
    setDatabaseQuery(query);
    startDatabaseRequest({ page: 1, replace: true, query, includeSystem: nextIncludeSystem });
  }, [cancelDatabaseWork, databaseDraftQuery, startDatabaseRequest]);

  const databaseListing = store.getDatabases(targetId, PAGE_SIZE, databaseQuery, includeSystem);

  const objectListings = useMemo(() => {
    const next = new Map<string, ObjectListingState>();
    for (const database of databaseListing.items) {
      const query = queries.get(database) ?? { draft: "", submitted: "" };
      const objects = store.getObjects(targetId, database, PAGE_SIZE, query.submitted);
      next.set(database, {
        draftQuery: query.draft,
        submittedQuery: query.submitted,
        items: objects.items,
        pageInfo: objects.pageInfo,
        status: objects.status === "idle" ? "idle" : objects.status,
        generation: 0,
      });
    }
    return next;
  }, [databaseListing, queries, store, targetId]);

  const loadMoreObjects = useCallback(
    (database: string) => {
      const listing = objectListings.get(database);
      if (!listing?.pageInfo?.hasNextPage || listing.status === "loading") return;
      startObjectRequest(database, listing.submittedQuery, listing.pageInfo.page + 1, false);
    },
    [objectListings, startObjectRequest],
  );

  const retryObjects = useCallback(
    (database: string) => {
      const listing = objectListings.get(database);
      if (!listing) return;
      const retryFailedLoadMore = Boolean(listing.pageInfo?.hasNextPage && listing.items.length > 0);
      startObjectRequest(
        database,
        listing.submittedQuery,
        retryFailedLoadMore ? listing.pageInfo!.page + 1 : 1,
        !retryFailedLoadMore,
      );
    },
    [objectListings, startObjectRequest],
  );

  const loadMoreDatabases = useCallback(() => {
    if (databaseListing.status === "loading" || !databaseListing.pageInfo?.hasNextPage) return;
    startDatabaseRequest({
      page: databaseListing.pageInfo.page + 1,
      replace: false,
      query: databaseQuery,
      includeSystem,
    });
  }, [databaseListing, databaseQuery, includeSystem, startDatabaseRequest]);

  const retryDatabases = useCallback(() => {
    const page = databaseListing.pageInfo?.hasNextPage ? databaseListing.pageInfo.page + 1 : 1;
    startDatabaseRequest({
      page,
      replace: page === 1 && databaseListing.pageInfo === null,
      query: databaseQuery,
      includeSystem,
    });
  }, [databaseListing.pageInfo, databaseQuery, includeSystem, startDatabaseRequest]);

  const refreshSchema = useCallback(() => {
    cancelDatabaseWork();
    startDatabaseRequest({
      page: 1,
      replace: true,
      query: databaseQuery,
      includeSystem,
      refresh: true,
    });
    for (const [database, listing] of objectListings) {
      if (!expandedDatabases.has(database)) continue;
      startObjectRequest(database, listing.submittedQuery, 1, true, true);
      for (const object of listing.items) {
        const state = store.getDetailState({
          targetId,
          database: object.database,
          kind: object.kind,
          name: object.name,
        });
        if (state.status !== "idle") loadObjectDetail(object, true);
      }
    }
  }, [
    cancelDatabaseWork,
    databaseQuery,
    expandedDatabases,
    includeSystem,
    loadObjectDetail,
    objectListings,
    startDatabaseRequest,
    startObjectRequest,
    store,
    targetId,
  ]);

  const loadingDetails = new Set<string>();
  for (const listing of objectListings.values()) {
    for (const object of listing.items) {
      const state = store.getDetailState({
        targetId,
        database: object.database,
        kind: object.kind,
        name: object.name,
      });
      if (state.status === "loading") loadingDetails.add(objectIdentityKey(object));
    }
  }

  const renderDetail = useCallback(
    (object: ObjectSummary) => {
      if (!object.database) return null;
      const state = store.getDetailState({
        targetId,
        database: object.database,
        kind: object.kind,
        name: object.name,
      });
      if (state.status === "idle" || state.status === "loading") return null;
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
      const detail = state.data;
      const columns = detail.columns ?? [];
      const indexes = detail.indexes ?? [];
      const foreignKeys = detail.foreignKeys ?? [];
      const foreignKeysTruncated = detail.truncated?.foreignKeys ?? true;
      return (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>{t("schema.detailColumns", { count: columns.length })}</p>
          <p>{t("schema.detailKeys", { count: columns.filter((column) => column.primaryKey).length })}</p>
          <p>{t("schema.detailIndexes", { count: indexes.length })}</p>
          <p>{t("schema.detailForeignKeys", { count: foreignKeys.length })}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1"
              data-testid="inspect-button"
              onClick={(event) => {
                setInspectTriggerElement(event.currentTarget);
                setInspectorKey(objectIdentityKey(object));
                setInspectorDetail(detail);
              }}
            >
              {t("schema.inspect")}
            </Button>
            {object.kind === "table" && onPreviewRequest ? (
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
            ) : null}
          </div>
        </div>
      );
    },
    [loadObjectDetail, onPreviewRequest, store, t, targetId],
  );

  const databaseLoading = databaseListing.status === "idle" || databaseListing.status === "loading";
  const databaseError = databaseListing.status === "error";

  return (
    <>
      <div className="space-y-2 pb-3">
        <label htmlFor="schema-database-search" className="text-xs font-medium">
          {t("schema.searchDatabasesLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id="schema-database-search"
            name="database-search"
            value={databaseDraftQuery}
            placeholder={t("schema.searchDatabasesPlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => searchDatabases(event.target.value)}
          />
          {databaseDraftQuery ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearDatabaseSearch}>
              {t("schema.clearDatabaseSearch")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={databaseListing.status === "loading"}
            onClick={refreshSchema}
          >
            {t("schema.refresh")}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeSystem}
            onChange={(event) => toggleIncludeSystem(event.target.checked)}
          />
          {t("schema.includeSystemDatabases")}
        </label>
      </div>
      {databaseLoading && databaseListing.items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("schema.loading")}</p>
      ) : null}
      {databaseError && databaseListing.items.length === 0 ? (
        <div className="space-y-2 p-4">
          <p className="text-sm text-destructive">{t("schema.loadError")}</p>
          <Button variant="outline" size="sm" onClick={retryDatabases}>{t("schema.retry")}</Button>
        </div>
      ) : null}
      {!databaseLoading && !databaseError && databaseListing.items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("schema.noDatabases")}</p>
      ) : null}
      {databaseListing.items.length > 0 ? (
        <>
          {databaseError ? (
            <div className="space-y-2 p-4">
              <p className="text-sm text-destructive">{t("schema.loadError")}</p>
              <Button variant="outline" size="sm" onClick={retryDatabases}>{t("schema.retry")}</Button>
            </div>
          ) : null}
          <QueryObjectTree
            databases={databaseListing.items}
            expandedDatabases={expandedDatabases}
            expandedObjects={expandedObjects}
            objectsByDatabase={new Map([...objectListings].map(([database, listing]) => [database, listing.items]))}
            loadingDatabases={new Set([...objectListings].filter(([, listing]) => listing.status === "loading").map(([database]) => database))}
            loadingObjects={loadingDetails}
            onDatabaseToggle={toggleDatabase}
            onObjectToggle={toggleObject}
            renderDetail={renderDetail}
            databasePageInfo={databaseListing.pageInfo}
            databaseLoading={databaseListing.status === "loading"}
            databaseError={databaseError}
            onLoadMoreDatabases={loadMoreDatabases}
            objectListings={objectListings}
            onSearch={searchObjects}
            onClearSearch={clearSearch}
            onLoadMoreObjects={loadMoreObjects}
            onRetryObjects={retryObjects}
            onDraftQueryChange={updateDraftQuery}
          />
        </>
      ) : null}
      {inspectorDetail ? (
        typeof window === "undefined" || typeof window.matchMedia === "function" ? (
          <QueryObjectInspector
            key={`${targetId}-${inspectorDetail.database}-${inspectorDetail.name}-${inspectorDetail.kind}`}
            open={inspectorKey !== null}
            onClose={closeInspector}
            detail={inspectorDetail}
            triggerElement={inspectTriggerElement}
            targetId={targetId}
          />
        ) : (
          <div role="dialog" aria-label={t("schema.inspectorTitle", { name: inspectorDetail.name })}>
            <h2>{t("schema.inspectorTitle", { name: inspectorDetail.name })}</h2>
          </div>
        )
      ) : null}
    </>
  );
}
