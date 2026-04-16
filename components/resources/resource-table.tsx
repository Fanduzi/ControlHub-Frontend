"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableShell } from "@/components/blocks/data-table-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { PaginationControls } from "@/components/blocks/pagination-controls";
import { StatusBadge } from "@/components/blocks/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import { formatDateTime, formatLabel } from "@/lib/format";
import type { PageInfo } from "@/types/resource";
import type { ResourceListViewModel } from "@/types/view-models";
import type { ResourceTypeDefinition } from "@/types/settings";

import { ResourceDetailSheetLoader } from "./resource-detail-sheet-loader";
import { CreateResourceSheet } from "./create-resource-sheet";

type ResourceTableProps = {
  resources: ResourceListViewModel[];
  pageInfo: PageInfo;
  resourceTypes: ResourceTypeDefinition[];
  availableSubtypes?: string[];
};

const columnHelper = createColumnHelper<ResourceListViewModel>();

const LIFECYCLE_OPTIONS = ["running", "active", "provisioning", "retired"] as const;
const HEALTH_OPTIONS = ["healthy", "warning", "critical"] as const;

export function ResourceTable({
  resources,
  pageInfo,
  resourceTypes,
  availableSubtypes,
}: ResourceTableProps) {
  const t = useTranslations();
  const localeValue = useLocale();
  const locale = isAppLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedResource, setSelectedResource] =
    useState<ResourceListViewModel | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const search = searchParams.get("q") ?? "";
  const resourceType = searchParams.get("resourceType") ?? "all";
  const resourceSubtype = searchParams.get("resourceSubtype") ?? "all";
  const lifecycleStatus = searchParams.get("lifecycleStatus") ?? "all";
  const healthStatus = searchParams.get("healthStatus") ?? "all";
  const archiveFilter = searchParams.get("archiveFilter") ?? "all";
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const columns = [
    columnHelper.accessor("displayName", {
      header: t("common.fields.resource"),
      cell: ({ row }) => (
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            {row.original.displayName}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.original.externalId || row.original.id}
          </p>
        </div>
      ),
    }),
    columnHelper.accessor("resourceType", {
      header: t("common.fields.resourceType"),
      cell: (info) => (
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            {formatLabel(info.getValue())}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatLabel(info.row.original.resourceSubtype)}
          </p>
        </div>
      ),
    }),
    columnHelper.accessor("environmentName", {
      header: t("common.fields.environment"),
      cell: (info) => (
        <span className="text-sm text-foreground">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("ownerName", {
      header: t("common.fields.owner"),
      cell: (info) => (
        <span className="text-sm text-foreground">{info.getValue()}</span>
      ),
    }),
    columnHelper.display({
      id: "status",
      header: t("common.fields.status"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          {row.original.isArchived && (
            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {t("common.actions.archived")}
            </span>
          )}
          <StatusBadge status={row.original.healthStatus} tone="health" />
          <StatusBadge status={row.original.lifecycleStatus} tone="lifecycle" />
        </div>
      ),
    }),
    columnHelper.accessor("updatedAt", {
      header: t("common.fields.updated"),
      cell: (info) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(info.getValue(), locale)}
        </span>
      ),
    }),
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: resources,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleSheetOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedResource(null);
    }
  }, []);

  const replaceSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key);
          return;
        }

        params.set(key, value);
      });

      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const subtypeOptions = (availableSubtypes?.length
    ? availableSubtypes
    : Array.from(
        new Set(resources.map((resource) => resource.resourceSubtype).filter(Boolean)),
      )
  ).sort();

  // Self-describing filter trigger labels
  const typeTriggerText = resourceType === "all"
    ? t("tables.resources.filterType")
    : `${t("tables.resources.filterType")}: ${resourceTypes.find(rt => rt.key === resourceType)?.label ?? formatLabel(resourceType)}`;
  const subtypeTriggerText = resourceSubtype === "all"
    ? t("tables.resources.filterSubtype")
    : `${t("tables.resources.filterSubtype")}: ${formatLabel(resourceSubtype)}`;
  const lifecycleTriggerText = lifecycleStatus === "all"
    ? t("tables.resources.filterLifecycle")
    : `${t("tables.resources.filterLifecycle")}: ${t(`statusValues.${lifecycleStatus}`)}`;
  const healthTriggerText = healthStatus === "all"
    ? t("tables.resources.filterHealth")
    : `${t("tables.resources.filterHealth")}: ${t(`statusValues.${healthStatus}`)}`;
  const archiveTriggerText = archiveFilter === "all"
    ? `${t("tables.resources.filterArchive")}: ${t("tables.resources.allArchive")}`
    : `${t("tables.resources.filterArchive")}: ${
        archiveFilter === "includeArchived"
          ? t("tables.resources.includeArchived")
          : t("tables.resources.archivedOnly")
      }`;

  return (
    <>
      <DataTableShell
        title={t("tables.resources.title")}
        description={t("tables.resources.description")}
        controls={
          <>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              {t("common.actions.createResource")}
            </Button>
            <Input
              value={searchDraft}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearchDraft(nextValue);
                replaceSearchParams({
                  q: nextValue.trim() ? nextValue.trim() : null,
                });
              }}
              placeholder={t("tables.resources.searchPlaceholder")}
              className="h-9 w-[220px] border-border bg-background py-2"
            />
            <Select
              value={resourceType}
              onValueChange={(value) =>
                replaceSearchParams({
                  resourceType:
                    !value || value === "all" ? null : value,
                })
              }
            >
              <SelectTrigger
                aria-label={t("tables.resources.filterType")}
                className="h-9 w-[200px] border-border bg-background"
              >
                <span className="truncate">{typeTriggerText}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("tables.resources.allTypes")}
                </SelectItem>
                {resourceTypes.map((rt) => (
                  <SelectItem key={rt.key} value={rt.key}>
                    {rt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={resourceSubtype}
              onValueChange={(value) =>
                replaceSearchParams({
                  resourceSubtype:
                    !value || value === "all" ? null : value,
                })
              }
            >
              <SelectTrigger
                aria-label={t("tables.resources.filterSubtype")}
                className="h-9 w-[200px] border-border bg-background"
              >
                <span className="truncate">{subtypeTriggerText}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("tables.resources.allSubtypes")}
                </SelectItem>
                {subtypeOptions.map((subtype) => (
                  <SelectItem key={subtype} value={subtype}>
                    {formatLabel(subtype)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={lifecycleStatus}
              onValueChange={(value) =>
                replaceSearchParams({
                  lifecycleStatus:
                    !value || value === "all" ? null : value,
                })
              }
            >
              <SelectTrigger
                aria-label={t("tables.resources.filterLifecycle")}
                className="h-9 w-[200px] border-border bg-background"
              >
                <span className="truncate">{lifecycleTriggerText}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("tables.resources.allLifecycle")}
                </SelectItem>
                {LIFECYCLE_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`statusValues.${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={healthStatus}
              onValueChange={(value) =>
                replaceSearchParams({
                  healthStatus:
                    !value || value === "all" ? null : value,
                })
              }
            >
              <SelectTrigger
                aria-label={t("tables.resources.filterHealth")}
                className="h-9 w-[200px] border-border bg-background"
              >
                <span className="truncate">{healthTriggerText}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("tables.resources.allHealth")}
                </SelectItem>
                {HEALTH_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`statusValues.${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={archiveFilter}
              onValueChange={(value) =>
                replaceSearchParams({
                  archiveFilter:
                    !value || value === "all" ? null : value,
                })
              }
            >
              <SelectTrigger
                aria-label={t("tables.resources.filterArchive")}
                className="h-9 w-[190px] border-border bg-background"
              >
                <span className="truncate">{archiveTriggerText}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("tables.resources.allArchive")}
                </SelectItem>
                <SelectItem value="includeArchived">
                  {t("tables.resources.includeArchived")}
                </SelectItem>
                <SelectItem value="archivedOnly">
                  {t("tables.resources.archivedOnly")}
                </SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        pagination={<PaginationControls pageInfo={pageInfo} />}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="bg-muted/20 hover:bg-muted/20"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-6">
                  <EmptyState
                    title={t("tables.resources.emptyTitle")}
                    description={t("tables.resources.emptyDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer${row.original.isArchived ? " opacity-60" : ""}`}
                  onClick={() => setSelectedResource(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTableShell>

      <ResourceDetailSheetLoader
        open={Boolean(selectedResource)}
        onOpenChange={handleSheetOpenChange}
        resource={selectedResource}
      />

      <CreateResourceSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
