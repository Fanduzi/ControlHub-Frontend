"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { QueryRelationshipMap } from "@/components/query/query-relationship-map";
import { getTableDefinition } from "@/services/query-schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  ColumnDetail,
  ForeignKeyDetail,
  IndexDetail,
  ObjectDetailResponse,
  TableDefinitionResponse,
} from "@/types/query-schema";

function subscribe(query: string, callback: () => void): () => void {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(query, callback),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type QueryObjectInspectorProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly detail: ObjectDetailResponse;
  readonly triggerElement: HTMLButtonElement | null;
  readonly targetId: number;
};

/* ------------------------------------------------------------------ */
/*  Section components                                                 */
/* ------------------------------------------------------------------ */

function TruncatedNotice({ message }: { readonly message: string }) {
  return (
    <p
      data-testid="inspector-truncated"
      className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
    >
      {message}
    </p>
  );
}

function EmptyNotice({ message }: { readonly message: string }) {
  return (
    <p
      data-testid="inspector-empty"
      className="text-xs text-muted-foreground"
    >
      {message}
    </p>
  );
}

/* ---------- Columns section ---------- */

function ColumnsSection({
  columns,
  truncated,
  t,
}: {
  readonly columns: readonly ColumnDetail[];
  readonly truncated: boolean;
  readonly t: (key: string) => string;
}) {
  return (
    <section aria-label={t("schema.inspectorColumns")}>
      <h3 className="mb-2 text-sm font-medium text-foreground">
        {t("schema.inspectorColumns")}
      </h3>
      {columns.length === 0 ? (
        <EmptyNotice message={t("schema.inspectorEmptyColumns")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" role="table">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">{t("schema.inspectorColOrdinal")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorColName")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorColType")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorColNullable")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorColPrimaryKey")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorColAutoIncrement")}</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col.name} className="border-b border-border/50">
                  <td className="px-2 py-1 tabular-nums text-muted-foreground">{col.ordinalPosition}</td>
                  <td className="px-2 py-1 font-medium text-foreground">{col.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">{col.databaseType}</td>
                  <td className="px-2 py-1">
                    <BooleanBadge value={col.nullable} t={t} />
                  </td>
                  <td className="px-2 py-1">
                    <BooleanBadge value={col.primaryKey} t={t} />
                  </td>
                  <td className="px-2 py-1">
                    <BooleanBadge value={col.autoIncrement} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {truncated && <TruncatedNotice message={t("schema.inspectorTruncatedColumns")} />}
    </section>
  );
}

/* ---------- Indexes section ---------- */

function IndexesSection({
  indexes,
  truncated,
  t,
}: {
  readonly indexes: readonly IndexDetail[];
  readonly truncated: boolean;
  readonly t: (key: string) => string;
}) {
  return (
    <section aria-label={t("schema.inspectorIndexes")}>
      <h3 className="mb-2 text-sm font-medium text-foreground">
        {t("schema.inspectorIndexes")}
      </h3>
      {indexes.length === 0 ? (
        <EmptyNotice message={t("schema.inspectorEmptyIndexes")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" role="table">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">{t("schema.inspectorIdxName")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorIdxColumns")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorIdxUnique")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorIdxPrimary")}</th>
              </tr>
            </thead>
            <tbody>
              {indexes.map((idx) => (
                <tr key={idx.name} className="border-b border-border/50">
                  <td className="px-2 py-1 font-medium text-foreground">{idx.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">{idx.columns.join(", ")}</td>
                  <td className="px-2 py-1">
                    <BooleanBadge value={idx.unique} t={t} />
                  </td>
                  <td className="px-2 py-1">
                    <BooleanBadge value={idx.primary} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {truncated && <TruncatedNotice message={t("schema.inspectorTruncatedIndexes")} />}
    </section>
  );
}

/* ---------- Foreign keys section ---------- */

function ForeignKeysSection({
  foreignKeys,
  truncated,
  t,
}: {
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly truncated: boolean;
  readonly t: (key: string) => string;
}) {
  return (
    <section aria-label={t("schema.inspectorForeignKeys")}>
      <h3 className="mb-2 text-sm font-medium text-foreground">
        {t("schema.inspectorForeignKeys")}
      </h3>
      {foreignKeys.length === 0 ? (
        <EmptyNotice message={t("schema.inspectorEmptyForeignKeys")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" role="table">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">{t("schema.inspectorFkName")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorFkColumns")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorFkRefDatabase")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorFkRefObject")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorFkRefColumns")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorFkOnUpdate")}</th>
                <th className="px-2 py-1 font-medium">{t("schema.inspectorFkOnDelete")}</th>
              </tr>
            </thead>
            <tbody>
              {foreignKeys.map((fk) => (
                <tr key={fk.name} className="border-b border-border/50">
                  <td className="px-2 py-1 font-medium text-foreground">{fk.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">{fk.columns.join(", ")}</td>
                  <td className="px-2 py-1 text-muted-foreground">{fk.referencedDatabase}</td>
                  <td className="px-2 py-1 text-muted-foreground">{fk.referencedObject}</td>
                  <td className="px-2 py-1 text-muted-foreground">{fk.referencedColumns.join(", ")}</td>
                  <td className="px-2 py-1 text-muted-foreground">{fk.onUpdate}</td>
                  <td className="px-2 py-1 text-muted-foreground">{fk.onDelete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {truncated && <TruncatedNotice message={t("schema.inspectorTruncatedForeignKeys")} />}
    </section>
  );
}

/* ---------- Boolean badge ---------- */

function BooleanBadge({
  value,
  t,
}: {
  readonly value: boolean;
  readonly t: (key: string) => string;
}) {
  return (
    <span
      className={value
        ? "inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
      }
    >
      {value ? t("schema.inspectorYes") : t("schema.inspectorNo")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Definition state                                                   */
/* ------------------------------------------------------------------ */

type DefinitionState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly response: TableDefinitionResponse }
  | { readonly status: "error"; readonly code: number };

function mapDefinitionError(status: number, t: (key: string) => string): string {
  switch (status) {
    case 400:
      return t("schema.definitionErrorUnavailable");
    case 403:
      return t("schema.definitionErrorAccessDenied");
    case 404:
      return t("schema.definitionErrorNotFound");
    case 408:
      return t("schema.definitionErrorTimeout");
    default:
      return t("schema.definitionErrorGeneric");
  }
}

/* ---------- Definition section ---------- */

function DefinitionSection({
  state,
  t,
  onRetry,
}: {
  readonly state: DefinitionState;
  readonly t: (key: string) => string;
  readonly onRetry: () => void;
}) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <section aria-label={t("schema.definitionTitle")}>
        <h3 className="mb-2 text-sm font-medium text-foreground">
          {t("schema.definitionTitle")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("schema.loadingDefinition")}</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section aria-label={t("schema.definitionTitle")}>
        <h3 className="mb-2 text-sm font-medium text-foreground">
          {t("schema.definitionTitle")}
        </h3>
        <div className="space-y-2">
          <p className="text-xs text-destructive">{mapDefinitionError(state.code, t)}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t("schema.retryDefinition")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t("schema.definitionTitle")}>
      <h3 className="mb-2 text-sm font-medium text-foreground">
        {t("schema.definitionTitle")}
      </h3>
      <div className="overflow-x-auto rounded border border-border bg-muted/30 p-3">
        <pre className="whitespace-pre text-xs text-foreground">{state.response.definition}</pre>
      </div>
      {state.response.truncated && (
        <TruncatedNotice message={t("schema.definitionTruncated")} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared inspector body                                              */
/* ------------------------------------------------------------------ */

function InspectorBody({
  detail,
  definitionState,
  t,
  onRetryDefinition,
}: {
  readonly detail: ObjectDetailResponse;
  readonly definitionState: DefinitionState;
  readonly t: (key: string) => string;
  readonly onRetryDefinition: () => void;
}) {
  return (
    <div className="space-y-6 py-2">
      <ColumnsSection
        columns={detail.columns}
        truncated={detail.truncated.columns}
        t={t}
      />
      <IndexesSection
        indexes={detail.indexes}
        truncated={detail.truncated.indexes}
        t={t}
      />
      <ForeignKeysSection
        foreignKeys={detail.foreignKeys}
        truncated={detail.truncated.foreignKeys}
        t={t}
      />
      <DefinitionSection
        state={definitionState}
        t={t}
        onRetry={onRetryDefinition}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function QueryObjectInspector({
  open,
  onClose,
  detail,
  triggerElement,
  targetId,
}: QueryObjectInspectorProps) {
  const t = useTranslations("queryWorkbench");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const triggerRef = useRef<HTMLButtonElement | null>(triggerElement);
  const [definitionState, setDefinitionState] = useState<DefinitionState>({ status: "idle" });
  const definitionGeneration = useRef(0);
  const definitionControllerRef = useRef<AbortController | null>(null);
  const [view, setView] = useState<"details" | "relationships">("details");
  const relationshipsTriggerRef = useRef<HTMLButtonElement>(null);

  // Keep ref in sync with the element
  useEffect(() => {
    triggerRef.current = triggerElement;
  }, [triggerElement]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      definitionControllerRef.current?.abort();
    };
  }, []);

  const title = useMemo(
    () => t("schema.inspectorTitle", { name: detail.name }),
    [t, detail.name],
  );

  const handleViewDefinition = useCallback(() => {
    const generation = definitionGeneration.current + 1;
    definitionGeneration.current = generation;

    definitionControllerRef.current?.abort();
    const controller = new AbortController();
    definitionControllerRef.current = controller;

    setDefinitionState({ status: "loading" });

    void getTableDefinition(targetId, {
      database: detail.database,
      name: detail.name,
      signal: controller.signal,
    }).then(
      (response) => {
        if (!controller.signal.aborted && generation === definitionGeneration.current) {
          setDefinitionState({ status: "ready", response });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted && generation === definitionGeneration.current) {
          const status = error instanceof Error && "status" in error
            ? (error as { status: number }).status
            : 502;
          setDefinitionState({ status: "error", code: status });
        }
      },
    );
  }, [targetId, detail.database, detail.name]);

  const handleRetryDefinition = useCallback(() => {
    handleViewDefinition();
  }, [handleViewDefinition]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        definitionControllerRef.current?.abort();
        definitionControllerRef.current = null;
        setDefinitionState({ status: "idle" });
        setView("details");
        onClose();
      }
    },
    [onClose],
  );

  const isTable = detail.kind === "table";
  const canViewRelationships = isTable && !detail.truncated.foreignKeys;
  const isRelationshipsView = view === "relationships";

  const handleViewRelationships = useCallback(() => {
    setView("relationships");
  }, []);

  const handleBackToDetails = useCallback(() => {
    setView("details");
    setTimeout(() => {
      relationshipsTriggerRef.current?.focus();
    }, 0);
  }, []);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto"
          showCloseButton={false}
          finalFocus={triggerRef}
        >
          <SheetHeader className="flex flex-row items-start justify-between gap-2 pr-2">
            <SheetTitle>
              {isRelationshipsView ? t("schema.relationshipMap") : title}
            </SheetTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => handleOpenChange(false)}
              aria-label={t("schema.closeInspector")}
            >
              <span aria-hidden>×</span>
            </Button>
          </SheetHeader>
          <div className="min-w-0 px-4 pb-4">
            {isRelationshipsView ? (
              <QueryRelationshipMap
                targetId={targetId}
                database={detail.database}
                name={detail.name}
                onBack={handleBackToDetails}
              />
            ) : (
              <>
                {isTable && (
                  <div className="mb-4 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleViewDefinition}
                      disabled={definitionState.status === "loading"}
                      data-testid="view-definition-button"
                    >
                      {definitionState.status === "loading"
                        ? t("schema.loadingDefinition")
                        : t("schema.viewDefinition")}
                    </Button>
                    {canViewRelationships && (
                      <Button
                        ref={relationshipsTriggerRef}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleViewRelationships}
                        data-testid="view-relationships-button"
                      >
                        {t("schema.viewRelationships")}
                      </Button>
                    )}
                  </div>
                )}
                <InspectorBody
                  detail={detail}
                  definitionState={definitionState}
                  t={t}
                  onRetryDefinition={handleRetryDefinition}
                />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-row items-start justify-between gap-2 pr-2">
          <DialogTitle>
            {isRelationshipsView ? t("schema.relationshipMap") : title}
          </DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => handleOpenChange(false)}
            aria-label={t("schema.closeInspector")}
          >
            <span aria-hidden>×</span>
          </Button>
        </DialogHeader>
        {isRelationshipsView ? (
          <QueryRelationshipMap
            targetId={targetId}
            database={detail.database}
            name={detail.name}
            onBack={handleBackToDetails}
          />
        ) : (
          <>
            {isTable && (
              <div className="mb-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleViewDefinition}
                  disabled={definitionState.status === "loading"}
                  data-testid="view-definition-button"
                >
                  {definitionState.status === "loading"
                    ? t("schema.loadingDefinition")
                    : t("schema.viewDefinition")}
                </Button>
                {canViewRelationships && (
                  <Button
                    ref={relationshipsTriggerRef}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleViewRelationships}
                    data-testid="view-relationships-button"
                  >
                    {t("schema.viewRelationships")}
                  </Button>
                )}
              </div>
            )}
            <InspectorBody
              detail={detail}
              definitionState={definitionState}
              t={t}
              onRetryDefinition={handleRetryDefinition}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
