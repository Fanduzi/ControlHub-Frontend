// input: react, navigation, table primitives, auth role, settings taxonomies, saved views, and resource health evidence
// output: inventory table with taxonomy filters, named-view controls, health evidence, and admin create affordance
// pos: inventory list view, mutation entry point, saved-view host, and compact health evidence surface
// note: if this file changes, update header and components/resources/README.md
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebounceCallback } from "@/hooks/use-debounce";
import { ResourceLink } from "@/components/blocks/resource-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { DataTableShell } from "@/components/blocks/data-table-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { useAdminRole } from "@/lib/auth-role";
import {
  MultiSelectFilter,
  buildMultiSelectParams,
  readMultiSelectValues,
} from "@/components/blocks/multi-select-filter";
import { PaginationControls } from "@/components/blocks/pagination-controls";
import { StatusBadge } from "@/components/blocks/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { formatLabel, formatRelativeDateTime } from "@/lib/format";
import { localizeResourceType } from "@/lib/resource-summary";
import type { PageInfo } from "@/types/resource";
import type { ResourceListViewModel } from "@/types/view-models";
import type { DictionaryItem, ResourceTypeDefinition } from "@/types/settings";

import { Columns3 } from "lucide-react";

import { saveResourceListUrl } from "@/lib/resource-list-persistence";

import { ResourceDetailSheetLoader } from "./resource-detail-sheet-loader";
import { CreateResourceSheet } from "./create-resource-sheet";
import { HealthEvidence } from "./health-evidence";
import { NamedInventoryViewControls } from "./named-inventory-view-controls";

type ResourceTableProps = {
  resources: ResourceListViewModel[];
  pageInfo: PageInfo;
  resourceTypes: ResourceTypeDefinition[];
  lifecycleStatuses: DictionaryItem[];
  healthStatuses: DictionaryItem[];
  availableSubtypes?: string[];
};

const columnHelper = createColumnHelper<ResourceListViewModel>();

function updateMultiSelectParams(
  pathname: string,
  router: ReturnType<typeof useRouter>,
  searchParams: URLSearchParams,
  key: string,
  values: string[],
) {
  const params = buildMultiSelectParams(searchParams, key, values);
  router.replace(`${pathname}?${params.toString()}`);
}

export function ResourceTable({
  resources,
  pageInfo,
  resourceTypes,
  lifecycleStatuses,
  healthStatuses,
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
  const isAdmin = useAdminRole();
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    resourceSubtype: false,
    externalId: false,
    source: false,
    hostname: false,
    port: false,
    nodes: false,
  });

  const search = searchParams.get("q") ?? "";
  const archiveFilter = searchParams.get("archiveFilter")
    ?? (searchParams.get("archivedOnly") === "true" ? "archivedOnly" : null)
    ?? (searchParams.get("includeArchived") === "true" ? "includeArchived" : "all");
  const [searchDraft, setSearchDraft] = useState(search);

  const selectedTypeValues = useMemo(
    () => readMultiSelectValues(searchParams, "resourceType"),
    [searchParams],
  );
  const selectedSubtypeValues = useMemo(
    () => readMultiSelectValues(searchParams, "resourceSubtype"),
    [searchParams],
  );
  const selectedLifecycleValues = useMemo(
    () => readMultiSelectValues(searchParams, "lifecycleStatus"),
    [searchParams],
  );
  const selectedHealthValues = useMemo(
    () => readMultiSelectValues(searchParams, "healthStatus"),
    [searchParams],
  );

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const columns = useMemo(() => [
    {
      id: "icon",
      size: 36,
      minSize: 36,
      enableHiding: false,
      cell: ({ row }: { row: { original: ResourceListViewModel } }) => {
        const type = row.original.resourceType;
        const subtype = row.original.resourceSubtype;
        if (type === "database_instance" || type === "database_cluster" || type === "database_proxy") {
          return <DbTypeIcon subtype={subtype} />;
        }
        return null;
      },
    },
    columnHelper.accessor("displayName", {
      header: t("common.fields.resource"),
      cell: ({ row }) => (
        <ResourceLink
          href={`/resources/${row.original.id}`}
          onClick={(e) => {
            e.stopPropagation();
            saveResourceListUrl(`${pathname}?${searchParams.toString()}`);
          }}
        >
          {row.original.displayName}
        </ResourceLink>
      ),
    }),
    columnHelper.accessor("resourceType", {
      header: t("common.fields.resourceType"),
      cell: (info) => (
        <span className="text-sm text-foreground">
          {localizeResourceType(info.getValue(), t)}
        </span>
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
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            {row.original.isArchived && (
              <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {t("common.actions.archived")}
              </span>
            )}
            <StatusBadge status={row.original.healthStatus} tone="health" />
            <StatusBadge status={row.original.lifecycleStatus} tone="lifecycle" />
          </div>
          <HealthEvidence resource={row.original} locale={locale} />
        </div>
      ),
    }),
    columnHelper.display({
      id: "hostname",
      header: t("common.fields.hostname"),
      enableHiding: true,
      cell: ({ row }) => {
        const rt = row.original.resourceType;
        if (rt !== "database_instance" && rt !== "host") return null;
        return (
          <span className="text-sm text-muted-foreground">
            {row.original.profileSummary?.hostname ?? "\u2014"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "port",
      header: t("common.fields.port"),
      enableHiding: true,
      cell: ({ row }) => {
        if (row.original.resourceType !== "database_instance") return null;
        return (
          <span className="text-sm text-muted-foreground">
            {row.original.profileSummary?.port ?? "\u2014"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "nodes",
      header: t("common.fields.nodes"),
      enableHiding: true,
      cell: ({ row }) => {
        if (row.original.resourceType !== "database_cluster") return null;
        return (
          <span className="text-sm text-muted-foreground">
            {row.original.profileSummary?.nodeCount ?? "\u2014"}
          </span>
        );
      },
    }),
    columnHelper.accessor("updatedAt", {
      header: t("common.fields.updated"),
      cell: (info) => (
        <span className="text-sm text-muted-foreground">
          {formatRelativeDateTime(info.getValue(), locale)}
        </span>
      ),
    }),
    columnHelper.accessor("resourceSubtype", {
      id: "resourceSubtype",
      header: t("common.fields.resourceSubtype"),
      cell: (info) => {
        const v = info.getValue();
        return v ? <span className="text-sm text-muted-foreground">{formatLabel(v)}</span> : <span className="text-muted-foreground">&mdash;</span>;
      },
    }),
    columnHelper.accessor("externalId", {
      id: "externalId",
      header: t("common.fields.externalId"),
      cell: (info) => {
        const v = info.getValue();
        return v ? <span className="font-mono text-xs text-muted-foreground">{v}</span> : <span className="text-muted-foreground">&mdash;</span>;
      },
    }),
    columnHelper.accessor("source", {
      id: "source",
      header: t("common.fields.source"),
      cell: (info) => {
        const v = info.getValue();
        return v ? <span className="text-sm text-muted-foreground">{formatLabel(v)}</span> : <span className="text-muted-foreground">&mdash;</span>;
      },
    }),
  ], [t, locale, searchParams, pathname]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: resources,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
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

  const debouncedSearch = useDebounceCallback(
    (value: string) => {
      replaceSearchParams({ q: value.trim() || null });
    },
    300,
  );

  const subtypeOptions = (availableSubtypes?.length
    ? availableSubtypes
    : Array.from(
        new Set(resources.map((resource) => resource.resourceSubtype).filter(Boolean)),
      )
  ).sort();

  const handleTypeChange = useCallback(
    (values: string[]) => {
      updateMultiSelectParams(pathname, router, searchParams, "resourceType", values);
    },
    [pathname, router, searchParams],
  );

  const handleSubtypeChange = useCallback(
    (values: string[]) => {
      updateMultiSelectParams(pathname, router, searchParams, "resourceSubtype", values);
    },
    [pathname, router, searchParams],
  );

  const handleLifecycleChange = useCallback(
    (values: string[]) => {
      updateMultiSelectParams(pathname, router, searchParams, "lifecycleStatus", values);
    },
    [pathname, router, searchParams],
  );

  const handleHealthChange = useCallback(
    (values: string[]) => {
      updateMultiSelectParams(pathname, router, searchParams, "healthStatus", values);
    },
    [pathname, router, searchParams],
  );

  // Self-describing archive filter trigger label
  const archiveTriggerText = archiveFilter === "all"
    ? `${t("tables.resources.filterArchive")}: ${t("tables.resources.allArchive")}`
    : `${t("tables.resources.filterArchive")}: ${
        archiveFilter === "includeArchived"
          ? t("tables.resources.includeArchived")
          : t("tables.resources.archivedOnly")
      }`;

  const typeOptions = useMemo(
    () =>
      resourceTypes.map((rt) => ({
        value: rt.key,
        label: rt.label,
      })),
    [resourceTypes],
  );

  const subtypeFilterOptions = useMemo(
    () =>
      subtypeOptions.map((subtype) => ({
        value: subtype,
        label: formatLabel(subtype),
      })),
    [subtypeOptions],
  );

  const lifecycleOptions = useMemo(
    () =>
      lifecycleStatuses.map((status) => ({
        value: status.key,
        label: t.has(`statusValues.${status.key}`)
          ? t(`statusValues.${status.key}`)
          : status.label,
      })),
    [lifecycleStatuses, t],
  );

  const healthOptions = useMemo(
    () =>
      healthStatuses.map((status) => ({
        value: status.key,
        label: t.has(`statusValues.${status.key}`)
          ? t(`statusValues.${status.key}`)
          : status.label,
      })),
    [healthStatuses, t],
  );

  return (
    <>
      <DataTableShell
        title={t("tables.resources.title")}
        description={t("tables.resources.description")}
        controls={
          <>
            {isAdmin === true && (
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                {t("common.actions.createResource")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="gap-2" />
                }
              >
                <Columns3 className="size-4" />
                {t("tables.resources.columnVisibility")}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {table.getAllLeafColumns()
                  .filter(col => col.id !== "icon")
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {typeof column.columnDef.header === "string"
                        ? column.columnDef.header
                        : column.id.replace(/([A-Z])/g, " ").replace(/^./, (s) => s.toUpperCase())}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <NamedInventoryViewControls
              columns={table.getVisibleLeafColumns().map((column) => column.id)}
              onApplyColumns={(visibleColumns) => {
                const visible = new Set(visibleColumns);
                setColumnVisibility(Object.fromEntries(
                  table.getAllLeafColumns().map((column) => [
                    column.id,
                    !column.getCanHide() || visible.has(column.id),
                  ]),
                ));
              }}
            />
            <Input
              value={searchDraft}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearchDraft(nextValue);
                debouncedSearch(nextValue);
              }}
              placeholder={t("tables.resources.searchPlaceholder")}
              className="h-9 w-[220px] border-border bg-background py-2"
            />
            <MultiSelectFilter
              label={t("tables.resources.filterType")}
              options={typeOptions}
              selectedValues={selectedTypeValues}
              onValuesChange={handleTypeChange}
              className="w-[200px]"
            />
            <MultiSelectFilter
              label={t("tables.resources.filterSubtype")}
              options={subtypeFilterOptions}
              selectedValues={selectedSubtypeValues}
              onValuesChange={handleSubtypeChange}
              className="w-[200px]"
            />
            <MultiSelectFilter
              label={t("tables.resources.filterLifecycle")}
              options={lifecycleOptions}
              selectedValues={selectedLifecycleValues}
              onValuesChange={handleLifecycleChange}
              className="w-[200px]"
            />
            <MultiSelectFilter
              label={t("tables.resources.filterHealth")}
              options={healthOptions}
              selectedValues={selectedHealthValues}
              onValuesChange={handleHealthChange}
              className="w-[200px]"
            />
            <Select
              value={archiveFilter}
              onValueChange={(value) =>
                replaceSearchParams({
                  archiveFilter:
                    !value || value === "all" ? null : value,
                  includeArchived: null,
                  archivedOnly: null,
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
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${row.original.displayName}`}
                  className={`cursor-pointer transition-colors${row.original.isArchived ? " opacity-60" : ""}`}
                  onClick={() => setSelectedResource(row.original)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.defaultPrevented) {
                      setSelectedResource(row.original);
                    }
                  }}
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
