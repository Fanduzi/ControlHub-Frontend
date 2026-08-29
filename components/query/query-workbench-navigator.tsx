// input: scoped query targets, filters, paging controls, and localized navigator callbacks
// output: responsive desktop/mobile connection navigator wrappers
// pos: query workbench navigator presentation boundary
// note: if this file changes, update header and components/query/README.md
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
  readonly onLoadMore?: () => void;
  readonly loadingMore?: boolean;
  readonly onLoadAllEngines?: () => void;
  readonly loadingEngines?: boolean;
  readonly targetLoadError?: string | null;
  readonly searchError?: boolean;
  readonly onRetrySearch?: () => void;
};

export function QueryWorkbenchNavigator({
  targets,
  activeTargetId,
  filters,
  engines,
  pageInfo,
  onSelect,
  onFilterChange,
  onLoadMore,
  loadingMore,
  onLoadAllEngines,
  loadingEngines,
  targetLoadError,
  searchError,
  onRetrySearch,
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
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      onLoadAllEngines={onLoadAllEngines}
      loadingEngines={loadingEngines}
      targetLoadError={targetLoadError}
      searchError={searchError}
      onRetrySearch={onRetrySearch}
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
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      onLoadAllEngines={onLoadAllEngines}
      loadingEngines={loadingEngines}
      targetLoadError={targetLoadError}
      searchError={searchError}
      onRetrySearch={onRetrySearch}
      searchInputRef={mobileSearchInputRef}
    />
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="hidden md:inline-flex"
        aria-label={t("connectionNavigator.open")}
        onClick={() => setDesktopOpen(true)}
      >
        <ListTree className="size-4" aria-hidden />
        {t("connectionNavigator.title")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="md:hidden"
        aria-label={t("connectionNavigator.openMobile")}
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
