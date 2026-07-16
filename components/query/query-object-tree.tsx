"use client";

import { ChevronRight, Database, Table2, View } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import type { PageInfo } from "@/types/resource";
import type { ObjectSummary } from "@/types/query-schema";

export type ObjectListingState = {
  readonly draftQuery: string;
  readonly submittedQuery: string;
  readonly items: readonly ObjectSummary[];
  readonly pageInfo: PageInfo | null;
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly generation: number;
};

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
  readonly databasePageInfo?: PageInfo | null;
  readonly databaseLoading?: boolean;
  readonly databaseError?: boolean;
  readonly onLoadMoreDatabases?: () => void;
  readonly objectListings?: ReadonlyMap<string, ObjectListingState>;
  readonly onSearch?: (database: string, query: string) => void;
  readonly onClearSearch?: (database: string) => void;
  readonly onLoadMoreObjects?: (database: string) => void;
  readonly onRetryObjects?: (database: string) => void;
  readonly onDraftQueryChange?: (database: string, query: string) => void;
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
  onLoadMoreDatabases,
  databasePageInfo = null,
  databaseLoading = false,
  objectListings,
  onSearch,
  onClearSearch,
  onLoadMoreObjects,
  onRetryObjects,
  onDraftQueryChange,
}: QueryObjectTreeProps) {
  const t = useTranslations("queryWorkbench");

  return (
    <div>
      <ul role="tree" aria-label={t("schema.objects")} className="space-y-1">
        {databases.map((database) => {
          const expanded = expandedDatabases.has(database);
          const listing = objectListings?.get(database);
          const objects = listing?.items ?? objectsByDatabase.get(database) ?? [];
          const isLoading = listing?.status === "loading" || loadingDatabases.has(database);
          const isError = listing?.status === "error";
          const showClear = Boolean(listing);

          return (
            <Fragment key={database}>
              <li role="treeitem" aria-expanded={expanded} aria-selected={false}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  aria-expanded={expanded}
                  onClick={() => onDatabaseToggle(database)}
                >
                  <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
                  <Database className="size-3.5 text-primary" aria-hidden />
                  <span className="truncate">{database}</span>
                </Button>
              </li>
              {expanded ? (
                <li className="ml-4 border-l border-border pl-2">
                  {onSearch && onDraftQueryChange ? (
                    <form
                      className="space-y-2 pb-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onSearch(database, listing?.draftQuery ?? "");
                      }}
                    >
                      <label htmlFor={`schema-search-${database}`} className="text-xs font-medium">
                        {t("schema.searchObjectsLabel", { database })}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`schema-search-${database}`}
                          value={listing?.draftQuery ?? ""}
                          placeholder={t("schema.searchObjectsPlaceholder")}
                          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onChange={(event) => onDraftQueryChange(database, event.target.value)}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          {t("schema.searchObjects")}
                        </Button>
                        {showClear && onClearSearch ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => onClearSearch(database)}>
                            {t("schema.clearObjectSearch")}
                          </Button>
                        ) : null}
                      </div>
                    </form>
                  ) : null}
                  {isLoading ? <p className="py-2 text-xs text-muted-foreground">{t("schema.loadingObjects")}</p> : null}
                  {isError ? (
                    <div className="space-y-2 py-2 text-xs">
                      <p className="text-destructive">{t("schema.objectsLoadError")}</p>
                      {onRetryObjects ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => onRetryObjects(database)}>
                          {t("schema.retryObjects")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {!isLoading && !isError && listing?.status === "ready" && objects.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">{t("schema.noObjects")}</p>
                  ) : null}
                  <ul role="group">
                    {(["table", "view"] as const).map((kind) => {
                      const group = objects.filter((object) => object.kind === kind);
                      if (group.length === 0) return null;
                      const Icon = kind === "table" ? Table2 : View;
                      const kindLabel = kind === "table" ? t("schema.tables") : t("schema.views");
                      return (
                        <li key={kind} role="treeitem" aria-label={kindLabel} aria-selected={false}>
                          <p className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground">
                            <Icon className="size-3" aria-hidden />
                            {kindLabel}
                          </p>
                          <ul role="group">
                            {group.map((object) => {
                              const key = `${object.database}:${object.kind}:${object.name}`;
                              const objectExpanded = expandedObjects.has(key);
                              return (
                                <li key={key} role="treeitem" aria-expanded={objectExpanded} aria-selected={false}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start"
                                    aria-expanded={objectExpanded}
                                    onClick={() => onObjectToggle(object)}
                                  >
                                    <ChevronRight className={`size-3 transition-transform ${objectExpanded ? "rotate-90" : ""}`} aria-hidden />
                                    <span className="truncate">{object.name}</span>
                                  </Button>
                                  {objectExpanded ? (
                                    <div className="ml-5 py-1">
                                      {loadingObjects.has(key) ? <p className="text-xs text-muted-foreground">{t("schema.loading")}</p> : renderDetail(object)}
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                  {listing?.pageInfo?.hasNextPage && onLoadMoreObjects ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={listing.status === "loading"}
                      onClick={() => onLoadMoreObjects(database)}
                    >
                      {t("schema.loadMoreObjects")}
                    </Button>
                  ) : null}
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ul>
      {databasePageInfo?.hasNextPage && onLoadMoreDatabases ? (
        <Button type="button" variant="outline" size="sm" className="mt-2" disabled={databaseLoading} onClick={onLoadMoreDatabases}>
          {t("schema.loadMoreDatabases")}
        </Button>
      ) : null}
    </div>
  );
}
