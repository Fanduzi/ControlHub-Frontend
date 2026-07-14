"use client";

import { useCallback, useMemo, useSyncExternalStore, type RefObject } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
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
/*  Shared inspector body                                              */
/* ------------------------------------------------------------------ */

function InspectorBody({
  detail,
  t,
}: {
  readonly detail: ObjectDetailResponse;
  readonly t: (key: string) => string;
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
  triggerRef,
}: QueryObjectInspectorProps) {
  const t = useTranslations("queryWorkbench");
  const isMobile = useMediaQuery("(max-width: 767px)");

  const title = useMemo(
    () => t("schema.inspectorTitle", { name: detail.name }),
    [t, detail.name],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        onClose();
        // Restore focus to trigger after close animation
        requestAnimationFrame(() => {
          const trigger = triggerRef.current;
          if (trigger && trigger.isConnected) {
            trigger.focus();
          }
        });
      }
    },
    [onClose, triggerRef],
  );

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
            <SheetTitle>{title}</SheetTitle>
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
            <InspectorBody detail={detail} t={t} />
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
          <DialogTitle>{title}</DialogTitle>
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
        <InspectorBody detail={detail} t={t} />
      </DialogContent>
    </Dialog>
  );
}
