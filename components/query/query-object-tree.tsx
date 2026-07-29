"use client";

import { ChevronRight, Database, Search, Table2, Trash2, View } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { objectIdentityKey, schemaObjectGroupId } from "@/lib/query-object-identity";
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

  const handleInputChange = (database: string, value: string) => {
    onDraftQueryChange?.(database, value);
    onSearch?.(database, value);
  };

  const handleClear = (database: string) => {
    onClearSearch?.(database);
  };

  return (
    <div>
      <ul role="tree" aria-label={t("schema.objects")} className="space-y-1">
        {databases.map((database) => {
          const expanded = expandedDatabases.has(database);
          const listing = objectListings?.get(database);
          const objects = listing?.items ?? objectsByDatabase.get(database) ?? [];
          const isLoading = listing?.status === "loading" || loadingDatabases.has(database);
          const isError = listing?.status === "error";
          const groupId = schemaObjectGroupId(database);

          return (
            <Fragment key={database}>
              <li
                role="treeitem"
                aria-expanded={expanded}
                aria-selected={false}
                aria-owns={expanded ? groupId : undefined}
              >
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
                <li role="none" className="ml-4 border-l border-border pl-2">
                  {onSearch && onDraftQueryChange ? (
                    <div className="space-y-2 pb-2">
                      <label htmlFor={`schema-search-${database}`} className="text-xs font-medium">
                        {t("schema.searchObjectsLabel", { database })}
                      </label>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <input
                          id={`schema-search-${database}`}
                          name="object-search"
                          value={listing?.draftQuery ?? ""}
                          placeholder={t("schema.searchObjectsPlaceholder")}
                          className="w-full rounded-md border border-input bg-background pl-7 pr-8 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onChange={(event) => handleInputChange(database, event.target.value)}
                        />
                        {(listing?.draftQuery ?? "").length > 0 && onClearSearch ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 size-6 -translate-y-1/2 p-0"
                            aria-label={t("schema.clearObjectSearch", { database })}
                            onClick={() => handleClear(database)}
                          >
                            <Trash2 className="size-3" aria-hidden />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {isLoading ? <p className="py-2 text-xs text-muted-foreground">{t("schema.loadingObjects")}</p> : null}
                  {isError ? (
                    <div className="space-y-2 py-2 text-xs">
                      <p className="text-destructive">{t("schema.objectsLoadError")}</p>
                      {onRetryObjects ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={t("schema.retryObjects", { database })}
                          onClick={() => onRetryObjects(database)}
                        >
                          {t("schema.retryObjects", { database })}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {!isLoading && !isError && listing?.status === "ready" && objects.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">{t("schema.noObjects")}</p>
                  ) : null}
                  <ul role="group" id={groupId}>
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
                              const key = objectIdentityKey(object);
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
                      aria-label={t("schema.loadMoreObjects", { database })}
                      onClick={() => onLoadMoreObjects(database)}
                    >
                      {t("schema.loadMoreObjects", { database })}
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
