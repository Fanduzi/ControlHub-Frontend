"use client";

import { useState } from "react";
import { ListTree } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { QueryObjectExplorer } from "@/components/query/query-object-explorer";
import { QuerySchemaStore } from "@/lib/query-schema-store";
import type { QueryKind, QueryTarget } from "@/types/query-target";

type QuerySchemaBrowserProps = { readonly target: QueryTarget; readonly store: QuerySchemaStore; readonly activeDatabase?: string | null };

export function QuerySchemaBrowser({ target, store, activeDatabase }: QuerySchemaBrowserProps) {
  const t = useTranslations("queryWorkbench");
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const explorer = <QueryObjectExplorer targetId={target.resourceId} store={store} />;
  const placeholder = placeholderText(target.capability.queryKind);

  return <>
    <span className="sr-only">{placeholder} {t("schema.locked")}</span>
    <Button type="button" variant="outline" className="hidden md:inline-flex" aria-label="Open objects" onClick={() => setDesktopOpen(true)}><ListTree className="size-4" aria-hidden />{activeDatabase ? `Objects: ${activeDatabase}` : "Objects"}</Button>
    <Button type="button" variant="outline" className="md:hidden" aria-label="Open objects on mobile" onClick={() => setMobileOpen(true)}><ListTree className="size-4" aria-hidden />Objects</Button>
    <Dialog open={desktopOpen} onOpenChange={setDesktopOpen}><DialogContent className="max-w-2xl p-0"><DialogHeader className="border-b border-border p-4 pr-12"><DialogTitle>{t("schema.title")}</DialogTitle></DialogHeader><div className="max-h-[70vh] overflow-y-auto p-4">{explorer}</div></DialogContent></Dialog>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto"><SheetHeader><SheetTitle>{t("schema.title")}</SheetTitle></SheetHeader><div className="min-w-0 px-4 pb-4">{explorer}</div></SheetContent></Sheet>
  </>;

  function placeholderText(kind: QueryKind): string {
    switch (kind) {
      case "sql": return t("schema.placeholderSql");
      case "redis": return t("schema.placeholderRedis");
      case "mongo": return t("schema.placeholderMongo");
      default: return t("schema.placeholderDefault");
    }
  }
}
