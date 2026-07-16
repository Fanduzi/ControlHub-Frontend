"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { QueryObjectInspector } from "@/components/query/query-object-inspector";
import { QueryObjectTree, type ObjectListingState } from "@/components/query/query-object-tree";
import { Button } from "@/components/ui/button";
import { QuerySchemaStore } from "@/lib/query-schema-store";
import { getObjectDetails, getSchemaDatabases, getSchemaObjects } from "@/services/query-schema";
import type { ObjectDetailResponse, ObjectSummary } from "@/types/query-schema";
import type { TablePreviewRequest } from "@/types/query-execution";
import type { PageInfo } from "@/types/resource";

const PAGE_SIZE = 25;

type DatabaseListingState = {
  readonly items: readonly string[];
  readonly pageInfo: PageInfo | null;
  readonly loading: boolean;
  readonly error: boolean;
  readonly generation: number;
};

type DetailViewState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly detail: ObjectDetailResponse }
  | { readonly status: "error" };

type QueryObjectExplorerProps = {
  readonly targetId: number;
  readonly store: QuerySchemaStore;
  readonly onPreviewRequest?: (request: TablePreviewRequest) => void;
};

const emptyDatabaseListing: DatabaseListingState = {
  items: [],
  pageInfo: null,
  loading: true,
  error: false,
  generation: 0,
};

function objectKey(object: ObjectSummary): string {
  return `${object.database}:${object.kind}:${object.name}`;
}

function dedupeDatabases(items: readonly string[]): readonly string[] {
  return [...new Set(items)];
}

function dedupeObjects(items: readonly ObjectSummary[]): readonly ObjectSummary[] {
  const seen = new Set<string>();
  return items.filter((object) => {
    const key = `${object.kind}:${object.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function QueryObjectExplorer({ targetId, store, onPreviewRequest }: QueryObjectExplorerProps) {
  const t = useTranslations("queryWorkbench");
  const [databaseListing, setDatabaseListing] = useState<DatabaseListingState>(emptyDatabaseListing);
  const [objectListings, setObjectListings] = useState<ReadonlyMap<string, ObjectListingState>>(new Map());
  const [details, setDetails] = useState<ReadonlyMap<string, DetailViewState>>(new Map());
  const [expandedDatabases, setExpandedDatabases] = useState<ReadonlySet<string>>(new Set());
  const [expandedObjects, setExpandedObjects] = useState<ReadonlySet<string>>(new Set());
  const [loadingDetails, setLoadingDetails] = useState<ReadonlySet<string>>(new Set());
  const [inspectorKey, setInspectorKey] = useState<string | null>(null);
  const [inspectorDetail, setInspectorDetail] = useState<ObjectDetailResponse | null>(null);
  const [inspectTriggerElement, setInspectTriggerElement] = useState<HTMLButtonElement | null>(null);

  const explorerGeneration = useRef(0);
  const databaseGeneration = useRef(0);
  const objectGenerations = useRef(new Map<string, number>());
  const databaseController = useRef<AbortController | null>(null);
  const objectControllers = useRef(new Map<string, AbortController>());
  const detailControllers = useRef(new Map<string, AbortController>());
  const expandedObjectsRef = useRef<ReadonlySet<string>>(new Set());
  const inspectorKeyRef = useRef<string | null>(null);

  useEffect(() => {
    expandedObjectsRef.current = expandedObjects;
  }, [expandedObjects]);

  useEffect(() => {
    inspectorKeyRef.current = inspectorKey;
  }, [inspectorKey]);

  const abortAllRequests = useCallback(() => {
    databaseController.current?.abort();
    databaseController.current = null;
    for (const controller of objectControllers.current.values()) controller.abort();
    objectControllers.current.clear();
    for (const controller of detailControllers.current.values()) controller.abort();
    detailControllers.current.clear();
  }, []);

  const startDatabaseRequest = useCallback(
    (page: number, replace: boolean) => {
      databaseController.current?.abort();
      const controller = new AbortController();
      databaseController.current = controller;
      const requestTargetId = targetId;
      const generation = databaseGeneration.current + 1;
      databaseGeneration.current = generation;
      const requestExplorerGeneration = explorerGeneration.current;
      startTransition(() => {
        setDatabaseListing((previous) => ({
          items: replace ? [] : previous.items,
          pageInfo: replace ? null : previous.pageInfo,
          loading: true,
          error: false,
          generation,
        }));
      });

      void getSchemaDatabases(targetId, { page, pageSize: PAGE_SIZE, signal: controller.signal }).then(
        (response) => {
          if (
            controller.signal.aborted ||
            databaseController.current !== controller ||
            requestTargetId !== targetId ||
            requestExplorerGeneration !== explorerGeneration.current ||
            generation !== databaseGeneration.current
          ) {
            return;
          }
          const names = response.items.map((database) => database.name);
          setDatabaseListing((previous) => ({
            items: dedupeDatabases(replace ? names : [...previous.items, ...names]),
            pageInfo: response.pageInfo,
            loading: false,
            error: false,
            generation,
          }));
        },
        () => {
          if (
            controller.signal.aborted ||
            databaseController.current !== controller ||
            requestExplorerGeneration !== explorerGeneration.current ||
            generation !== databaseGeneration.current
          ) {
            return;
          }
          setDatabaseListing((previous) => ({ ...previous, loading: false, error: true, generation }));
        },
      ).finally(() => {
        if (databaseController.current === controller) databaseController.current = null;
      });
    },
    [targetId],
  );

  useEffect(() => {
    abortAllRequests();
    explorerGeneration.current += 1;
    objectGenerations.current.clear();
    startTransition(() => {
      setDatabaseListing({ ...emptyDatabaseListing });
      setObjectListings(new Map());
      setDetails(new Map());
      setExpandedDatabases(new Set());
      setExpandedObjects(new Set());
      setLoadingDetails(new Set());
      setInspectorKey(null);
      setInspectorDetail(null);
      setInspectTriggerElement(null);
    });
    startDatabaseRequest(1, true);
    return abortAllRequests;
  }, [abortAllRequests, startDatabaseRequest]);

  const nextObjectGeneration = useCallback((database: string): number => {
    const generation = (objectGenerations.current.get(database) ?? 0) + 1;
    objectGenerations.current.set(database, generation);
    return generation;
  }, []);

  const removeObjectsFromState = useCallback(
    (database: string, items: readonly ObjectSummary[]) => {
      const activeKeys = new Set(items.map(objectKey));
      const removedKeys = [...expandedObjectsRef.current].filter(
        (key) => key.startsWith(`${database}:`) && !activeKeys.has(key),
      );
      if (removedKeys.length === 0) return;
      for (const key of removedKeys) detailControllers.current.get(key)?.abort();
      for (const key of removedKeys) detailControllers.current.delete(key);
      setExpandedObjects((previous) => {
        const next = new Set(previous);
        for (const key of removedKeys) next.delete(key);
        return next;
      });
      setDetails((previous) => {
        const next = new Map(previous);
        for (const key of removedKeys) next.delete(key);
        return next;
      });
      setLoadingDetails((previous) => {
        const next = new Set(previous);
        for (const key of removedKeys) next.delete(key);
        return next;
      });
      if (inspectorKeyRef.current && removedKeys.includes(inspectorKeyRef.current)) {
        setInspectorKey(null);
        setInspectorDetail(null);
        setInspectTriggerElement(null);
      }
    },
    [],
  );

  const startObjectRequest = useCallback(
    ({
      database,
      draftQuery,
      submittedQuery,
      page,
      replace,
      preserveItems,
    }: {
      readonly database: string;
      readonly draftQuery: string;
      readonly submittedQuery: string;
      readonly page: number;
      readonly replace: boolean;
      readonly preserveItems: boolean;
    }) => {
      objectControllers.current.get(database)?.abort();
      const controller = new AbortController();
      objectControllers.current.set(database, controller);
      const requestTargetId = targetId;
      const generation = replace ? nextObjectGeneration(database) : objectGenerations.current.get(database) ?? nextObjectGeneration(database);
      const requestExplorerGeneration = explorerGeneration.current;
      const previous = objectListings.get(database);
      const currentItems = previous?.items ?? [];
      startTransition(() => {
        setObjectListings((listings) => {
          const next = new Map(listings);
          next.set(database, {
            draftQuery,
            submittedQuery,
            items: replace && !preserveItems ? [] : currentItems,
            pageInfo: replace && !preserveItems ? null : previous?.pageInfo ?? null,
            status: "loading",
            generation,
          });
          return next;
        });
      });

      void getSchemaObjects(targetId, {
        database,
        ...(submittedQuery ? { q: submittedQuery } : {}),
        page,
        pageSize: PAGE_SIZE,
        signal: controller.signal,
      }).then(
        (response) => {
          if (
            controller.signal.aborted ||
            objectControllers.current.get(database) !== controller ||
            requestTargetId !== targetId ||
            requestExplorerGeneration !== explorerGeneration.current ||
            generation !== objectGenerations.current.get(database)
          ) {
            return;
          }
          const nextItems = dedupeObjects(replace ? response.items : [...currentItems, ...response.items]);
          if (replace) removeObjectsFromState(database, nextItems);
          setObjectListings((listings) => {
            const next = new Map(listings);
            const listing = next.get(database);
            if (!listing) return listings;
            next.set(database, {
              ...listing,
              draftQuery,
              submittedQuery,
              items: nextItems,
              pageInfo: response.pageInfo,
              status: "ready",
              generation,
            });
            return next;
          });
        },
        () => {
          if (
            controller.signal.aborted ||
            objectControllers.current.get(database) !== controller ||
            requestExplorerGeneration !== explorerGeneration.current ||
            generation !== objectGenerations.current.get(database)
          ) {
            return;
          }
          setObjectListings((listings) => {
            const next = new Map(listings);
            const listing = next.get(database);
            if (listing) next.set(database, { ...listing, status: "error", generation });
            return next;
          });
        },
      ).finally(() => {
        if (objectControllers.current.get(database) === controller) objectControllers.current.delete(database);
      });
    },
    [objectListings, nextObjectGeneration, removeObjectsFromState, targetId],
  );

  const toggleDatabase = useCallback(
    (database: string) => {
      const next = new Set(expandedDatabases);
      if (next.has(database)) {
        next.delete(database);
      } else {
        next.add(database);
        if (!objectListings.has(database)) {
          startObjectRequest({ database, draftQuery: "", submittedQuery: "", page: 1, replace: true, preserveItems: false });
        }
      }
      setExpandedDatabases(next);
    },
    [expandedDatabases, objectListings, startObjectRequest],
  );

  const loadObjectDetail = useCallback(
    (object: ObjectSummary) => {
      if (!object.database) return;
      const key = objectKey(object);
      if (inspectorKey === key) {
        setInspectorKey(null);
        setInspectorDetail(null);
        setInspectTriggerElement(null);
      }
      detailControllers.current.get(key)?.abort();
      const controller = new AbortController();
      detailControllers.current.set(key, controller);
      const storeKey = { targetId, database: object.database, kind: object.kind, name: object.name };
      store.setDetailLoading(storeKey);
      setLoadingDetails((previous) => new Set(previous).add(key));
      setDetails((previous) => new Map(previous).set(key, { status: "loading" }));
      const requestExplorerGeneration = explorerGeneration.current;
      void getObjectDetails(targetId, { database: object.database, name: object.name, kind: object.kind, signal: controller.signal }).then(
        (detail) => {
          if (!controller.signal.aborted && detailControllers.current.get(key) === controller && requestExplorerGeneration === explorerGeneration.current) {
            store.setDetail(storeKey, detail);
            setDetails((previous) => new Map(previous).set(key, { status: "ready", detail }));
          }
        },
        () => {
          if (!controller.signal.aborted && detailControllers.current.get(key) === controller && requestExplorerGeneration === explorerGeneration.current) {
            store.setEmptyDetail(storeKey);
            setDetails((previous) => new Map(previous).set(key, { status: "error" }));
          }
        },
      ).finally(() => {
        if (detailControllers.current.get(key) === controller) detailControllers.current.delete(key);
        if (!controller.signal.aborted && requestExplorerGeneration === explorerGeneration.current) {
          setLoadingDetails((previous) => {
            const next = new Set(previous);
            next.delete(key);
            return next;
          });
        }
      });
    },
    [inspectorKey, store, targetId],
  );

  const toggleObject = useCallback(
    (object: ObjectSummary) => {
      if (!object.database) return;
      const key = objectKey(object);
      const next = new Set(expandedObjects);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setExpandedObjects(next);
      if (!next.has(key) && inspectorKey === key) {
        setInspectorKey(null);
        setInspectorDetail(null);
        setInspectTriggerElement(null);
      }
      if (next.has(key) && !details.has(key)) loadObjectDetail(object);
    },
    [details, expandedObjects, inspectorKey, loadObjectDetail],
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

  const updateDraftQuery = useCallback((database: string, draftQuery: string) => {
    setObjectListings((listings) => {
      const next = new Map(listings);
      const listing = next.get(database);
      if (listing) next.set(database, { ...listing, draftQuery });
      return next;
    });
  }, []);

  const searchObjects = useCallback(
    (database: string, query: string) => {
      const submittedQuery = query.trim();
      startObjectRequest({ database, draftQuery: query, submittedQuery, page: 1, replace: true, preserveItems: false });
    },
    [startObjectRequest],
  );

  const clearSearch = useCallback(
    (database: string) => startObjectRequest({ database, draftQuery: "", submittedQuery: "", page: 1, replace: true, preserveItems: false }),
    [startObjectRequest],
  );

  const loadMoreObjects = useCallback(
    (database: string) => {
      const listing = objectListings.get(database);
      if (!listing?.pageInfo?.hasNextPage || listing.status === "loading") return;
      startObjectRequest({
        database,
        draftQuery: listing.draftQuery,
        submittedQuery: listing.submittedQuery,
        page: listing.pageInfo.page + 1,
        replace: false,
        preserveItems: true,
      });
    },
    [objectListings, startObjectRequest],
  );

  const retryObjects = useCallback(
    (database: string) => {
      const listing = objectListings.get(database);
      if (!listing) return;
      startObjectRequest({
        database,
        draftQuery: listing.draftQuery,
        submittedQuery: listing.submittedQuery,
        page: listing.pageInfo?.hasNextPage ? listing.pageInfo.page + 1 : 1,
        replace: true,
        preserveItems: true,
      });
    },
    [objectListings, startObjectRequest],
  );

  const loadMoreDatabases = useCallback(() => {
    if (databaseListing.loading || !databaseListing.pageInfo?.hasNextPage) return;
    startDatabaseRequest(databaseListing.pageInfo.page + 1, false);
  }, [databaseListing, startDatabaseRequest]);

  const retryDatabases = useCallback(() => {
    const page = databaseListing.pageInfo?.hasNextPage ? databaseListing.pageInfo.page + 1 : 1;
    startDatabaseRequest(page, page === 1 && databaseListing.pageInfo === null);
  }, [databaseListing.pageInfo, startDatabaseRequest]);

  const renderDetail = useCallback(
    (object: ObjectSummary) => {
      const state = details.get(objectKey(object));
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
      const foreignKeysTruncated = state.detail.truncated?.foreignKeys ?? true;
      return (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>{t("schema.detailColumns", { count: columns.length })}</p>
          <p>{t("schema.detailKeys", { count: columns.filter((column) => column.primaryKey).length })}</p>
          <p>{t("schema.detailIndexes", { count: indexes.length })}</p>
          <p>{t("schema.detailForeignKeys", { count: foreignKeys.length })}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="mt-1" data-testid="inspect-button" onClick={(event) => {
              setInspectTriggerElement(event.currentTarget);
              setInspectorKey(objectKey(object));
              setInspectorDetail(state.detail);
            }}>
              {t("schema.inspect")}
            </Button>
            {object.kind === "table" && onPreviewRequest ? (
              <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => onPreviewRequest({
                targetId,
                database: object.database,
                table: object.name,
                kind: "table",
                foreignKeys,
                foreignKeysTruncated,
              })}>
                {t("schema.previewRows")}
              </Button>
            ) : null}
          </div>
        </div>
      );
    },
    [details, loadObjectDetail, onPreviewRequest, t, targetId],
  );

  if (databaseListing.loading && databaseListing.items.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("schema.loading")}</p>;
  if (databaseListing.error && databaseListing.items.length === 0) {
    return <div className="space-y-2 p-4"><p className="text-sm text-destructive">{t("schema.loadError")}</p><Button variant="outline" size="sm" onClick={retryDatabases}>{t("schema.retry")}</Button></div>;
  }
  if (databaseListing.items.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("schema.noDatabases")}</p>;

  return (
    <>
      {databaseListing.error ? <div className="space-y-2 p-4"><p className="text-sm text-destructive">{t("schema.loadError")}</p><Button variant="outline" size="sm" onClick={retryDatabases}>{t("schema.retry")}</Button></div> : null}
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
        databaseLoading={databaseListing.loading}
        databaseError={databaseListing.error}
        onLoadMoreDatabases={loadMoreDatabases}
        objectListings={objectListings}
        onSearch={searchObjects}
        onClearSearch={clearSearch}
        onLoadMoreObjects={loadMoreObjects}
        onRetryObjects={retryObjects}
        onDraftQueryChange={updateDraftQuery}
      />
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
