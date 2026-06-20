"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, Lock, Play, ScrollText, Save } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QueryEditorShellProps = {
  target: QueryTarget;
};

type WorksheetTab = "worksheet" | "savedSheets" | "history" | "access";

const WORKSHEET_TABS: { id: WorksheetTab; labelKey: string }[] = [
  { id: "worksheet", labelKey: "editor.worksheetTab" },
  { id: "savedSheets", labelKey: "editor.savedSheetsTab" },
  { id: "history", labelKey: "editor.historyTab" },
  { id: "access", labelKey: "editor.accessTab" },
];

const RESULT_TABS = ["grid", "json", "explain", "logs", "masking"] as const;
type ResultTab = (typeof RESULT_TABS)[number];

export function QueryEditorShell({ target }: QueryEditorShellProps) {
  const t = useTranslations("queryWorkbench");
  const [activeTab, setActiveTab] = useState<WorksheetTab>("worksheet");
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("grid");

  const actions = target.availableActions;

  return (
    <section
      aria-label={t("editor.worksheetTab")}
      className="flex min-w-0 flex-col rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30">
        <ul role="tablist" className="flex flex-wrap">
          {WORKSHEET_TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "border-b-2 px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(tab.labelKey)}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="hidden items-center gap-2 pr-3 text-xs text-muted-foreground sm:flex">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            {t("editor.readonlyBadge")}
          </Badge>
          <span>{t("editor.timeout")}</span>
          <span>{t("editor.maxRows")}</span>
        </div>
      </div>

      {activeTab === "worksheet" ? (
        <div className="flex flex-col">
          <LockedActionBar run={actions.run} explain={actions.explain} exportEnabled={actions.export} saveSheet={actions.saveSheet} />

          <div className="relative border-b border-border bg-muted/20 p-4">
            <pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground/70">
              {t("editor.placeholderHint")}
            </pre>
            <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {t("editor.lockTitle")}
                </p>
                <p className="text-sm text-muted-foreground">{t("editor.lockDescription")}</p>
              </div>
            </div>
          </div>

          <LockedResult
            activeTab={activeResultTab}
            onSelect={setActiveResultTab}
          />
        </div>
      ) : (
        <PlaceholderTab tab={activeTab} />
      )}
    </section>
  );
}

function PlaceholderTab({ tab }: { tab: Exclude<WorksheetTab, "worksheet"> }) {
  const t = useTranslations("queryWorkbench");
  const text =
    tab === "savedSheets"
      ? t("editor.savedSheetsPlaceholder")
      : tab === "history"
        ? t("editor.historyPlaceholder")
        : t("editor.accessPlaceholder");

  return (
    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

function LockedActionBar({
  run,
  explain,
  exportEnabled,
  saveSheet,
}: {
  run: boolean;
  explain: boolean;
  exportEnabled: boolean;
  saveSheet: boolean;
}) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <Button variant="outline" size="sm" disabled={!run}>
        <Play className="size-3.5" aria-hidden />
        {t("actions.run")}
      </Button>
      <Button variant="outline" size="sm" disabled={!explain}>
        <ScrollText className="size-3.5" aria-hidden />
        {t("actions.explain")}
      </Button>
      <Button variant="outline" size="sm" disabled={!saveSheet}>
        <Save className="size-3.5" aria-hidden />
        {t("actions.saveSheet")}
      </Button>
      <Button variant="outline" size="sm" disabled={!exportEnabled}>
        <Ban className="size-3.5" aria-hidden />
        {t("actions.export")}
      </Button>
      <span className="ml-auto text-xs text-muted-foreground">
        {t("actionState.locked")}
      </span>
    </div>
  );
}

function LockedResult({
  activeTab,
  onSelect,
}: {
  activeTab: ResultTab;
  onSelect: (tab: ResultTab) => void;
}) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <ul role="tablist" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {RESULT_TABS.map((tab) => {
            const active = tab === activeTab;
            return (
              <li key={tab}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(tab)}
                  className={cn(
                    active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`result.${tab}`)}
                </button>
              </li>
            );
          })}
        </ul>
        <span className="text-xs text-muted-foreground">{t("result.notExecuted")}</span>
      </div>

      <div className="relative m-3 overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {t("result.lockTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("result.lockDescription")}</p>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ResultNote label={t("result.lastQuery")} value={t("result.lastQueryValue")} />
            <ResultNote label={t("result.copyExport")} value={t("result.copyExportValue")} />
            <ResultNote label={t("result.sensitive")} value={t("result.sensitiveValue")} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function ResultNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xs text-foreground">{value}</dd>
    </div>
  );
}
