// input: react, navigation, table primitives, auth role, settings taxonomies, saved views, resource health evidence, atomic bulk resource services, and ingestion dialog
// output: inventory table with server-owned taxonomy/label filters, URL-synced optimistic label controls, named-view controls, server-derived completeness, health evidence, admin create/ingestion affordances, and reviewed atomic bulk mutations with localized feedback
// pos: inventory list view, mutation entry point, saved-view host, compact completeness, health evidence surface, and role-gated bulk edit/import controls
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { normalizeLabelFilter } from "@/lib/list-page-search-params";
import { localizeResourceType } from "@/lib/resource-summary";
import { ApiError } from "@/services/api-client";
import { confirmBulkResourceMutation, previewBulkResourceMutation } from "@/services/resources";
import type { BulkResourceMutationPreview, BulkResourceMutationRequest, PageInfo } from "@/types/resource";
import type { ResourceListViewModel } from "@/types/view-models";
import type { DictionaryItem, Environment, Owner, ResourceTypeDefinition } from "@/types/settings";

import { Columns3, X } from "lucide-react";

import { saveResourceListUrl } from "@/lib/resource-list-persistence";

import { ResourceDetailSheetLoader } from "./resource-detail-sheet-loader";
import { CreateResourceSheet } from "./create-resource-sheet";
import { HealthEvidence } from "./health-evidence";
import { NamedInventoryViewControls } from "./named-inventory-view-controls";
import { IngestionDialog } from "./ingestion-dialog";

type ResourceTableProps = {
  resources: ResourceListViewModel[];
  pageInfo: PageInfo;
  resourceTypes: ResourceTypeDefinition[];
  lifecycleStatuses: DictionaryItem[];
  healthStatuses: DictionaryItem[];
  environments?: Environment[];
  owners?: Owner[];
  availableSubtypes?: string[];
};

const columnHelper = createColumnHelper<ResourceListViewModel>();

type LabelOperation = "add" | "update" | "remove";
type LifecycleStatus = NonNullable<BulkResourceMutationRequest["fieldPatch"]>["lifecycleStatus"];
const BULK_UNCHANGED = "__unchanged";

function isBulkMutationConflict(error: unknown) {
  return error instanceof ApiError
    ? error.status === 409 || error.code === "bulk_resource_mutation_conflict"
    : error === "bulk_resource_mutation_conflict";
}

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
  environments = [],
  owners = [],
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
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [labelOperation, setLabelOperation] = useState<LabelOperation>("add");
  const [labelKey, setLabelKey] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [bulkOwnerId, setBulkOwnerId] = useState(BULK_UNCHANGED);
  const [bulkEnvironmentId, setBulkEnvironmentId] = useState(BULK_UNCHANGED);
  const [bulkLifecycleStatus, setBulkLifecycleStatus] = useState(BULK_UNCHANGED);
  const [bulkRequest, setBulkRequest] = useState<BulkResourceMutationRequest | null>(null);
  const [preview, setPreview] = useState<BulkResourceMutationPreview | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [ingestionOpen, setIngestionOpen] = useState(false);
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
  const [labelDraft, setLabelDraft] = useState("");

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
  const urlLabelValues = useMemo(
    () => searchParams.getAll("label")
      .map(normalizeLabelFilter)
      .filter((label): label is string => label !== undefined),
    [searchParams],
  );
  const [selectedLabelValues, setSelectedLabelValues] = useState(urlLabelValues);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    setSelectedLabelValues(urlLabelValues);
  }, [searchParams, urlLabelValues]);

  const columns = useMemo(() => [
    ...(isAdmin === true ? [columnHelper.display({
      id: "select",
      size: 36,
      minSize: 36,
      enableHiding: false,
      header: ({ table: tableInstance }) => (
        <input
          type="checkbox"
          aria-label={t("tables.resources.bulk.selectAll")}
          checked={tableInstance.getIsAllPageRowsSelected()}
          ref={(input) => {
            if (input) input.indeterminate = tableInstance.getIsSomePageRowsSelected();
          }}
          onChange={tableInstance.getToggleAllPageRowsSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={t("tables.resources.bulk.selectResource", { name: row.original.displayName })}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(event) => event.stopPropagation()}
        />
      ),
    })] : []),
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
      id: "completeness",
      header: t("common.fields.completeness"),
      cell: ({ row }) => {
        const completeness = row.original.completeness;
        if (!completeness) return <span className="text-muted-foreground">&mdash;</span>;

        return (
          <div className="text-sm">
            <div className="font-medium text-foreground">
              {t("common.completeness.score", { score: completeness.score })}
            </div>
            <div className="text-muted-foreground">
              {t(`common.completeness.status.${completeness.status}`)}
            </div>
          </div>
        );
      },
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
  ], [t, locale, searchParams, pathname, isAdmin]);

  const table = useReactTable({
    data: resources,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (resource) => String(resource.id),
    enableRowSelection: isAdmin === true,
    state: { columnVisibility, rowSelection },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
  });
  const selectedResources = table.getSelectedRowModel().rows.map((row) => row.original);

  const resetBulkPreview = useCallback(() => {
    setPreview(null);
    setBulkRequest(null);
    setBulkError(null);
  }, []);

  const handleBulkPreview = useCallback(async () => {
    const key = labelKey.trim();
    const fieldPatch = {
      ...(bulkOwnerId === BULK_UNCHANGED ? {} : { ownerId: Number(bulkOwnerId) }),
      ...(bulkEnvironmentId === BULK_UNCHANGED ? {} : { environmentId: Number(bulkEnvironmentId) }),
      ...(bulkLifecycleStatus === BULK_UNCHANGED ? {} : { lifecycleStatus: bulkLifecycleStatus as LifecycleStatus }),
    };
    const labels = !key ? undefined : labelOperation === "remove"
      ? { remove: [key] }
      : labelValue ? { [labelOperation]: { [key]: labelValue } } : undefined;
    const request: BulkResourceMutationRequest = {
      targets: selectedResources.map((resource) => ({
        resourceId: resource.id,
        expectedVersion: resource.updatedAt,
      })),
      ...(Object.keys(fieldPatch).length ? { fieldPatch } : {}),
      ...(labels ? { labels } : {}),
    };

    setBulkPending(true);
    setBulkError(null);
    try {
      setBulkRequest(request);
      setPreview(await previewBulkResourceMutation(request));
    } catch (error) {
      setBulkError(t(isBulkMutationConflict(error)
        ? "tables.resources.bulk.conflict"
        : "tables.resources.bulk.previewFailed"));
    } finally {
      setBulkPending(false);
    }
  }, [bulkEnvironmentId, bulkLifecycleStatus, bulkOwnerId, labelKey, labelOperation, labelValue, selectedResources, t]);

  const handleBulkConfirm = useCallback(async () => {
    if (!bulkRequest || !preview?.fingerprint) return;

    setBulkPending(true);
    setBulkError(null);
    try {
      await confirmBulkResourceMutation(bulkRequest, preview.fingerprint);
      setBulkOpen(false);
      setRowSelection({});
      resetBulkPreview();
      router.refresh();
    } catch (error) {
      setPreview(null);
      setBulkError(t(isBulkMutationConflict(error)
        ? "tables.resources.bulk.conflict"
        : "tables.resources.bulk.confirmFailed"));
    } finally {
      setBulkPending(false);
    }
  }, [bulkRequest, preview, resetBulkPreview, router, t]);

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

  const updateLabelFilters = useCallback(
    (values: string[]) => {
      setSelectedLabelValues(values);
      updateMultiSelectParams(pathname, router, searchParams, "label", values);
    },
    [pathname, router, searchParams],
  );

  const handleAddLabelFilter = useCallback(() => {
    const label = normalizeLabelFilter(labelDraft);
    if (!label || selectedLabelValues.includes(label)) return;
    updateLabelFilters([...selectedLabelValues, label]);
    setLabelDraft("");
  }, [labelDraft, selectedLabelValues, updateLabelFilters]);

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
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIngestionOpen(true)}
                >
                  {t("mutations.ingestion.open")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                >
                  {t("common.actions.createResource")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedResources.length === 0}
                  onClick={() => {
                    resetBulkPreview();
                    setBulkOpen(true);
                  }}
                >
                  {t("tables.resources.bulk.editResources", { count: selectedResources.length })}
                </Button>
              </>
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
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t("tables.resources.filterLabels")}>
              <Input
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddLabelFilter();
                  }
                }}
                aria-label={t("tables.resources.filterLabels")}
                placeholder={t("tables.resources.labelFilterPlaceholder")}
                className="h-9 w-[160px] border-border bg-background py-2"
              />
              <Button size="sm" variant="outline" onClick={handleAddLabelFilter}>
                {t("tables.resources.addLabelFilter")}
              </Button>
              {selectedLabelValues.map((label) => (
                <Badge key={label} variant="outline" className="gap-1">
                  {label}
                  <button
                    type="button"
                    onClick={() => updateLabelFilters(selectedLabelValues.filter((value) => value !== label))}
                    aria-label={t("tables.resources.removeLabelFilter", { label })}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {selectedLabelValues.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => updateLabelFilters([])}>
                  {t("tables.resources.clearLabelFilters")}
                </Button>
              )}
            </div>
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
      <Dialog open={bulkOpen} onOpenChange={(open) => {
        setBulkOpen(open);
        if (!open) resetBulkPreview();
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("tables.resources.bulk.title")}</DialogTitle>
            <DialogDescription>
              {t("tables.resources.bulk.description", { count: selectedResources.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              {t("common.fields.owner")}
              <Select value={bulkOwnerId} onValueChange={(value) => {
                setBulkOwnerId(value ?? BULK_UNCHANGED);
                resetBulkPreview();
              }} disabled={Boolean(preview)}>
                <SelectTrigger aria-label={t("common.fields.owner")}>
                  <span>{bulkOwnerId === BULK_UNCHANGED ? t("tables.resources.bulk.unchanged") : owners.find((owner) => String(owner.id) === bulkOwnerId)?.name}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BULK_UNCHANGED}>{t("tables.resources.bulk.unchanged")}</SelectItem>
                  {owners.map((owner) => <SelectItem key={owner.id} value={String(owner.id)}>{owner.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              {t("common.fields.environment")}
              <Select value={bulkEnvironmentId} onValueChange={(value) => {
                setBulkEnvironmentId(value ?? BULK_UNCHANGED);
                resetBulkPreview();
              }} disabled={Boolean(preview)}>
                <SelectTrigger aria-label={t("common.fields.environment")}>
                  <span>{bulkEnvironmentId === BULK_UNCHANGED ? t("tables.resources.bulk.unchanged") : environments.find((environment) => String(environment.id) === bulkEnvironmentId)?.name}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BULK_UNCHANGED}>{t("tables.resources.bulk.unchanged")}</SelectItem>
                  {environments.map((environment) => <SelectItem key={environment.id} value={String(environment.id)}>{environment.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              {t("tables.resources.bulk.lifecycle")}
              <Select value={bulkLifecycleStatus} onValueChange={(value) => {
                setBulkLifecycleStatus(value ?? BULK_UNCHANGED);
                resetBulkPreview();
              }} disabled={Boolean(preview)}>
                <SelectTrigger aria-label={t("tables.resources.bulk.lifecycle")}>
                  <span>{bulkLifecycleStatus === BULK_UNCHANGED ? t("tables.resources.bulk.unchanged") : lifecycleOptions.find((status) => status.value === bulkLifecycleStatus)?.label}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BULK_UNCHANGED}>{t("tables.resources.bulk.unchanged")}</SelectItem>
                  {lifecycleOptions.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              {t("tables.resources.bulk.operation")}
              <Select value={labelOperation} onValueChange={(value) => {
                setLabelOperation(value as LabelOperation);
                resetBulkPreview();
              }} disabled={Boolean(preview)}>
                <SelectTrigger aria-label={t("tables.resources.bulk.operation")}>
                  <span>{t(`tables.resources.bulk.operations.${labelOperation}`)}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">{t("tables.resources.bulk.operations.add")}</SelectItem>
                  <SelectItem value="update">{t("tables.resources.bulk.operations.update")}</SelectItem>
                  <SelectItem value="remove">{t("tables.resources.bulk.operations.remove")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              {t("tables.resources.bulk.key")}
              <Input value={labelKey} disabled={Boolean(preview)} onChange={(event) => {
                setLabelKey(event.target.value);
                resetBulkPreview();
              }} />
            </label>
            {labelOperation !== "remove" && (
              <label className="grid gap-1 text-sm">
                {t("tables.resources.bulk.value")}
                <Input value={labelValue} disabled={Boolean(preview)} onChange={(event) => {
                  setLabelValue(event.target.value);
                  resetBulkPreview();
                }} />
              </label>
            )}
            {bulkError && <p role="alert" className="text-sm text-destructive">{bulkError}</p>}
            {preview && (
              <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3 text-sm">
                {preview.items.map((item) => (
                  <div key={item.resourceId} className="space-y-1">
                    <p className="font-medium">{t("tables.resources.bulk.resource", { id: item.resourceId })}</p>
                    {item.conflict && <p className="text-destructive">{t("tables.resources.bulk.itemConflict")}</p>}
                    {item.errors?.map((error) => <p key={error} className="text-destructive">{t(isBulkMutationConflict(error)
                      ? "tables.resources.bulk.conflict"
                      : "tables.resources.bulk.previewFailed")}</p>)}
                    {item.fieldDiffs?.map((diff) => <p key={diff.field}>{diff.field}: {String(diff.before ?? "—")} → {String(diff.after ?? "—")}</p>)}
                    {item.labelDiffs?.map((diff) => <p key={diff.key}>{diff.key}: {diff.before ?? "—"} → {diff.after ?? "—"}</p>)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            {!preview ? (
              <Button onClick={handleBulkPreview} disabled={bulkPending || (!bulkOwnerId || !bulkEnvironmentId || !bulkLifecycleStatus || (!labelKey.trim() && bulkOwnerId === BULK_UNCHANGED && bulkEnvironmentId === BULK_UNCHANGED && bulkLifecycleStatus === BULK_UNCHANGED) || (Boolean(labelKey.trim()) && labelOperation !== "remove" && !labelValue))}>
                {bulkPending ? t("tables.resources.bulk.previewing") : t("tables.resources.bulk.preview")}
              </Button>
            ) : (
              <Button onClick={handleBulkConfirm} disabled={bulkPending || !preview.confirmable || !preview.fingerprint}>
                {bulkPending ? t("tables.resources.bulk.confirming") : t("tables.resources.bulk.confirm")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <IngestionDialog open={ingestionOpen} onOpenChange={setIngestionOpen} />
    </>
  );
}
