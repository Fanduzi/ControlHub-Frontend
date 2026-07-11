"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSchemaDatabases, getSchemaObjects } from "@/services/query-schema";
import type { DatabaseSummary, ObjectSummary } from "@/types/query-schema";

type QueryObjectQuickNavigatorProps = {
  readonly targetId: number;
  readonly activeDatabase: string | null;
  readonly onDatabaseSelect: (database: string) => void;
  readonly onRevealObject?: (object: ObjectSummary) => void;
  readonly onInsertObject: (object: Pick<ObjectSummary, "database" | "name">) => void;
};

export function QueryObjectQuickNavigator({ targetId, activeDatabase, onDatabaseSelect, onRevealObject, onInsertObject }: QueryObjectQuickNavigatorProps) {
  const pathname = usePathname();
  const t = useTranslations("queryWorkbench.navigator");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [databases, setDatabases] = useState<readonly DatabaseSummary[]>([]);
  const [objects, setObjects] = useState<readonly ObjectSummary[]>([]);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (pathname !== "/query" || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void getSchemaDatabases(targetId, { page: 1, pageSize: 50, signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) setDatabases(response.items);
    }, () => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [open, targetId]);

  useEffect(() => {
    if (!open || !activeDatabase) return;
    const controller = new AbortController();
    const params = query
      ? { database: activeDatabase, q: query, page: 1, pageSize: 50, signal: controller.signal }
      : { database: activeDatabase, page: 1, pageSize: 50, signal: controller.signal };
    void getSchemaObjects(targetId, params).then((response) => {
      if (!controller.signal.aborted) setObjects(response.items);
    }, () => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [activeDatabase, open, query, targetId]);

  const options = [...databases.filter((database) => database.name.includes(query)).map((database) => ({ kind: "database" as const, database: database.name })), ...objects.map((object) => ({ kind: "object" as const, object }))];
  function activate() { const option = options[activeIndex]; if (!option) return; if (option.kind === "database") onDatabaseSelect(option.database); else onRevealObject?.(option.object); }
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent aria-label={t("title")}><DialogTitle>{t("title")}</DialogTitle><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0))); } if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); } if (event.key === "Enter") { event.preventDefault(); activate(); } }} aria-label={t("search")} className="w-full rounded-md border border-input px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />{error ? <Button onClick={() => { setError(false); setOpen(false); setTimeout(() => setOpen(true)); }}>{t("retry")}</Button> : null}<div role="listbox">{options.map((option, index) => option.kind === "database" ? <Button key={option.database} variant="ghost" className="w-full justify-start" aria-selected={index === activeIndex} onClick={() => onDatabaseSelect(option.database)}>{option.database}</Button> : <div key={`${option.object.kind}-${option.object.name}`} className="flex items-center justify-between"><Button variant="ghost" aria-selected={index === activeIndex} onClick={() => onRevealObject?.(option.object)}>{option.object.name}</Button><Button size="sm" onClick={() => onInsertObject(option.object)}>{t("insert")}</Button></div>)}</div></DialogContent></Dialog>;
}
