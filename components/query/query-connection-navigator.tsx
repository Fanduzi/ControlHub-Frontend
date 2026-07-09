"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { QueryTarget } from "@/types/query-target";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  filterTargets,
  groupTargetsByEnvironmentAndCluster,
  type WorkbenchFilters,
} from "@/lib/query-target-display";
import { NavigatorBody } from "@/components/query/query-connection-navigator-body";

export type QueryConnectionNavigatorProps = {
  targets: QueryTarget[];
  activeTargetId: number | null;
  filters: WorkbenchFilters;
  engines: string[];
  onSelect: (resourceId: number) => void;
  onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
};

export function QueryConnectionNavigator({
  targets,
  activeTargetId,
  filters,
  engines,
  onSelect,
  onFilterChange,
}: QueryConnectionNavigatorProps) {
  const t = useTranslations("queryWorkbench");
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeTarget = useMemo(
    () => targets.find((target) => target.resourceId === activeTargetId) ?? null,
    [targets, activeTargetId],
  );
  const filteredTargets = useMemo(
    () => filterTargets(targets, filters),
    [targets, filters],
  );
  const groupedTargets = useMemo(
    () => groupTargetsByEnvironmentAndCluster(filteredTargets),
    [filteredTargets],
  );

  function handleSelect(resourceId: number) {
    onSelect(resourceId);
    setMobileOpen(false);
  }

  const content = (
    <NavigatorBody
      activeTarget={activeTarget}
      filters={filters}
      groupedTargets={groupedTargets}
      engines={engines}
      onFilterChange={onFilterChange}
      onSelect={handleSelect}
    />
  );

  return (
    <>
      <div className="xl:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button variant="outline" className="w-full justify-between">
                <span>{t("connectionNavigator.title")}</span>
              </Button>
            }
          />
          <SheetContent side="left" className="w-80 sm:max-w-sm p-0">
            <SheetHeader className="px-4 pt-4">
              <SheetTitle>{t("connectionNavigator.title")}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">{content}</div>
          </SheetContent>
        </Sheet>
      </div>

      <aside
        className="hidden xl:flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
        aria-label={t("connectionNavigator.title")}
      >
        <h2 className="font-heading text-sm font-semibold">
          {t("connectionNavigator.title")}
        </h2>
        {content}
      </aside>
    </>
  );
}
