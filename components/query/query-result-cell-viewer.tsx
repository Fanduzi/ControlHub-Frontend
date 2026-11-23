"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatResultJson } from "@/lib/query-result-cell-json";

/**
 * Read-only viewer for a delivered string cell: pretty-printed JSON when the
 * text parses, exact raw text otherwise. Disabled when the selected cell is
 * not inspectable — nothing is fetched, copied, or persisted.
 */
export function QueryResultCellViewer({
  cell,
}: {
  cell: { name: string; value: string } | null;
}) {
  const t = useTranslations("queryWorkbench.result");
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const value = cell?.value;
  const formatted = useMemo(
    () => (open && value !== undefined ? formatResultJson(value) : null),
    [open, value],
  );

  if (!cell) {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        {t("viewCellValue")}
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setRaw(false);
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {t("viewCellValue")}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] min-w-0 grid-rows-[auto_1fr] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("viewCellValue")}</DialogTitle>
          <DialogDescription className="break-all pr-8">
            {cell.name}
            {formatted === null ? (
              <span className="text-muted-foreground"> · {t("cellViewerText")}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          {formatted !== null ? (
            <div className="inline-flex items-center gap-1" role="group">
              <Button
                type="button"
                size="sm"
                variant={!raw ? "secondary" : "ghost"}
                aria-pressed={!raw}
                onClick={() => setRaw(false)}
              >
                {t("cellViewerFormattedJson")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={raw ? "secondary" : "ghost"}
                aria-pressed={raw}
                onClick={() => setRaw(true)}
              >
                {t("cellViewerRawText")}
              </Button>
            </div>
          ) : null}
          <pre
            tabIndex={0}
            className="min-h-0 min-w-0 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
            aria-label={t("cellViewerContent")}
            data-testid="result-cell-content"
          >
            {!raw && formatted !== null ? formatted : cell.value}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
