"use client";

import { ChevronRight, Database, FolderTree, Search, Table2, Trash2, View } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  objectIdentityKey,
  schemaObjectGroupId,
  schemaScopeKey,
} from "@/lib/query-object-identity";
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

export type SchemaListingState = {
  readonly items: readonly string[];
  readonly status: "idle" | "loading" | "ready" | "error";
};

/**
 * Optional third level for PostgreSQL targets: databases enumerate
 * connections, each expanded connection lists its namespaces, and each
 * expanded namespace lists objects. Keys in `expanded`/listing maps are
 * `schemaScopeKey(database, schema)` scope strings.
 */
export type SchemaLevel = {
  readonly listings: ReadonlyMap<string, SchemaListingState>;
  readonly expanded: ReadonlySet<string>;
  readonly disabled: ReadonlySet<string>;
  readonly onToggle: (database: string, schema: string) => void;
  readonly onRetry: (database: string) => void;
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
  /** Right-click menu content for an object row (a ContextMenuContent subtree); omitted rows get no menu. */
  readonly renderObjectMenu?: (object: ObjectSummary) => React.ReactNode;
  readonly databasePageInfo?: PageInfo | null;
  readonly databaseLoading?: boolean;
  readonly databaseError?: boolean;
  readonly onLoadMoreDatabases?: () => void;
  readonly schemaLevel?: SchemaLevel;
  readonly objectListings?: ReadonlyMap<string, ObjectListingState>;
  readonly onSearch?: (scope: string, query: string) => void;
  readonly onClearSearch?: (scope: string) => void;
  readonly onLoadMoreObjects?: (scope: string) => void;
  readonly onRetryObjects?: (scope: string) => void;
  readonly onDraftQueryChange?: (scope: string, query: string) => void;
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
  renderObjectMenu,
  onLoadMoreDatabases,
  databasePageInfo = null,
  databaseLoading = false,
  schemaLevel,
  objectListings,
  onSearch,
  onClearSearch,
  onLoadMoreObjects,
  onRetryObjects,
  onDraftQueryChange,
}: QueryObjectTreeProps) {
  const t = useTranslations("queryWorkbench");

  const handleInputChange = (scope: string, value: string) => {
    onDraftQueryChange?.(scope, value);
    onSearch?.(scope, value);
  };

  const handleClear = (scope: string) => {
    onClearSearch?.(scope);
  };

  const renderScopeObjects = (scope: string, label: string, schema: string) => {
    const listing = objectListings?.get(scope);
    const objects = listing?.items ?? objectsByDatabase.get(scope) ?? [];
    const isLoading = listing?.status === "loading" || loadingDatabases.has(scope);
    const isError = listing?.status === "error";
    const groupId = schemaObjectGroupId(label, schema);
    return (
      <li role="none" className="ml-4 border-l border-border pl-2">
        {onSearch && onDraftQueryChange ? (
          <div className="space-y-2 pb-2">
            <label htmlFor={`schema-search-${groupId}`} className="text-xs font-medium">
              {t("schema.searchObjectsLabel", { database: label })}
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id={`schema-search-${groupId}`}
                name="object-search"
                value={listing?.draftQuery ?? ""}
                placeholder={t("schema.searchObjectsPlaceholder")}
                className="w-full rounded-md border border-input bg-background pl-7 pr-8 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => handleInputChange(scope, event.target.value)}
              />
              {(listing?.draftQuery ?? "").length > 0 && onClearSearch ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 size-6 -translate-y-1/2 p-0"
                  aria-label={t("schema.clearObjectSearch", { database: label })}
                  onClick={() => handleClear(scope)}
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
                aria-label={t("schema.retryObjects", { database: label })}
                onClick={() => onRetryObjects(scope)}
              >
                {t("schema.retryObjects", { database: label })}
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
                    const rowButton = (
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
                    );
                    return (
                      <li key={key} role="treeitem" aria-expanded={objectExpanded} aria-selected={false}>
                        {renderObjectMenu ? (
                          <ContextMenu>
                            <ContextMenuTrigger>{rowButton}</ContextMenuTrigger>
                            {renderObjectMenu(object)}
                          </ContextMenu>
                        ) : (
                          rowButton
                        )}
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
            aria-label={t("schema.loadMoreObjects", { database: label })}
            onClick={() => onLoadMoreObjects(scope)}
          >
            {t("schema.loadMoreObjects", { database: label })}
          </Button>
        ) : null}
      </li>
    );
  };

  const renderSchemas = (database: string) => {
    const listing = schemaLevel?.listings.get(database);
    const status = listing?.status ?? "idle";
    const schemas = listing?.items ?? [];
    return (
      <li role="none" className="ml-4 border-l border-border pl-2">
        {schemaLevel?.disabled.has(database) ? (
          <p className="py-2 text-xs text-muted-foreground">{t("schema.connectionDisabled")}</p>
        ) : null}
        {!schemaLevel?.disabled.has(database) && status === "loading" ? (
          <p className="py-2 text-xs text-muted-foreground">{t("schema.loadingObjects")}</p>
        ) : null}
        {!schemaLevel?.disabled.has(database) && status === "error" ? (
          <div className="space-y-2 py-2 text-xs">
            <p className="text-destructive">{t("schema.schemasLoadError")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t("schema.retryObjects", { database })}
              onClick={() => schemaLevel?.onRetry(database)}
            >
              {t("schema.retryObjects", { database })}
            </Button>
          </div>
        ) : null}
        {!schemaLevel?.disabled.has(database) && status === "ready" && schemas.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">{t("schema.noSchemas")}</p>
        ) : null}
        <ul role="group" id={schemaObjectGroupId(database)} aria-label={t("schema.schemasLabel", { database })}>
          {schemas.map((schema) => {
            const scope = schemaScopeKey(database, schema);
            const schemaExpanded = schemaLevel?.expanded.has(scope) === true;
            return (
              <Fragment key={scope}>
                <li role="treeitem" aria-expanded={schemaExpanded} aria-selected={false}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    aria-expanded={schemaExpanded}
                    onClick={() => schemaLevel?.onToggle(database, schema)}
                  >
                    <ChevronRight className={`size-3 transition-transform ${schemaExpanded ? "rotate-90" : ""}`} aria-hidden />
                    <FolderTree className="size-3.5 text-primary" aria-hidden />
                    <span className="truncate">{schema}</span>
                  </Button>
                </li>
                {schemaExpanded ? renderScopeObjects(scope, schema, schema) : null}
              </Fragment>
            );
          })}
        </ul>
      </li>
    );
  };

  return (
    <div>
      <ul role="tree" aria-label={t("schema.objects")} className="space-y-1">
        {databases.map((database) => {
          const expanded = expandedDatabases.has(database);
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
                  {schemaLevel?.disabled.has(database) ? (
                    <span className="ml-auto rounded border border-border px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("schema.connectionDisabledBadge")}
                    </span>
                  ) : null}
                </Button>
              </li>
              {expanded
                ? schemaLevel
                  ? renderSchemas(database)
                  : renderScopeObjects(database, database, "")
                : null}
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
