"use client";

import { useRef, useState } from "react";
import { ListTree } from "lucide-react";
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
import { QueryConnectionNavigator } from "@/components/query/query-connection-navigator";
import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import type { WorkbenchFilters } from "@/lib/query-target-display";

type QueryWorkbenchNavigatorProps = {
  readonly targets: QueryTarget[];
  readonly activeTargetId: number | null;
  readonly filters: WorkbenchFilters;
  readonly engines: string[];
  readonly pageInfo: PageInfo;
  readonly onSelect: (resourceId: number) => void;
  readonly onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
};

export function QueryWorkbenchNavigator({
  targets,
  activeTargetId,
  filters,
  engines,
  pageInfo,
  onSelect,
  onFilterChange,
}: QueryWorkbenchNavigatorProps) {
  const t = useTranslations("queryWorkbench");
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  function selectTarget(resourceId: number) {
    onSelect(resourceId);
    setDesktopOpen(false);
    setMobileOpen(false);
  }

  const desktopNavigator = (
    <QueryConnectionNavigator
      targets={targets}
      activeTargetId={activeTargetId}
      filters={filters}
      engines={engines}
      pageInfo={pageInfo}
      onSelect={selectTarget}
      onFilterChange={onFilterChange}
    />
  );
  const mobileNavigator = (
    <QueryConnectionNavigator
      targets={targets}
      activeTargetId={activeTargetId}
      filters={filters}
      engines={engines}
      pageInfo={pageInfo}
      onSelect={selectTarget}
      onFilterChange={onFilterChange}
      searchInputRef={mobileSearchInputRef}
    />
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="hidden md:inline-flex"
        aria-label="Open connections"
        onClick={() => setDesktopOpen(true)}
      >
        <ListTree className="size-4" aria-hidden />
        {t("connectionNavigator.title")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="md:hidden"
        aria-label="Open connections on mobile"
        onClick={() => setMobileOpen(true)}
      >
        <ListTree className="size-4" aria-hidden />
        {t("connectionNavigator.title")}
      </Button>

      <Dialog open={desktopOpen} onOpenChange={setDesktopOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="border-b border-border p-4 pr-12">
            <DialogTitle>{t("connectionNavigator.title")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto p-4">{desktopNavigator}</div>
        </DialogContent>
      </Dialog>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto"
          initialFocus={mobileSearchInputRef}
        >
          <SheetHeader>
            <SheetTitle>{t("connectionNavigator.title")}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{mobileNavigator}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
