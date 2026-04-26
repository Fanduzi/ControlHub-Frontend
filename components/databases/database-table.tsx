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
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableShell } from "@/components/blocks/data-table-shell";
import { PaginationControls } from "@/components/blocks/pagination-controls";
import { EmptyState } from "@/components/blocks/empty-state";
import { MultiSelectFilter, readMultiSelectValues, buildMultiSelectParams } from "@/components/blocks/multi-select-filter";
import { StatusBadge } from "@/components/blocks/status-badge";
import { Input } from "@/components/ui/input";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { formatDateTime, formatLabel, formatRelativeDateTime } from "@/lib/format";
import type { PageInfo } from "@/types/resource";
import type { ResourceListViewModel } from "@/types/view-models";

import { ResourceDetailSheetLoader } from "@/components/resources/resource-detail-sheet-loader";
import { ChevronRight, ChevronDown } from "lucide-react";

type DatabaseTableProps = {
  resources: ResourceListViewModel[];
  totalClusters: number;
  totalInstances: number;
};

type TreeRow = ResourceListViewModel & {
  subRows?: TreeRow[];
  isOrphan?: boolean;
};

const columnHelper = createColumnHelper<TreeRow>();

const ENGINE_OPTIONS = [
  "mysql",
  "postgresql",
  "redis",
  "mongodb",
  "tidb",
  "clickhouse",
  "proxysql",
  "chproxy",
] as const;

function buildTree(resources: ResourceListViewModel[]): TreeRow[] {
  const clusterMap = new Map<number, TreeRow>();
  const orphans: TreeRow[] = [];
  const memberMap = new Map<number, ResourceListViewModel[]>();

  for (const r of resources) {
    if (r.resourceType === "database_cluster") {
      clusterMap.set(r.id, { ...r, subRows: [] });
    }
  }

  for (const r of resources) {
    if (r.resourceType !== "database_instance") {
      continue;
    }
    const parentId = r.clusterId;
    if (parentId && clusterMap.has(parentId)) {
      const list = memberMap.get(parentId) ?? [];
      list.push(r);
      memberMap.set(parentId, list);
    } else if (parentId && !clusterMap.has(parentId)) {
      orphans.push({ ...r, isOrphan: true });
    } else {
      orphans.push({ ...r, clusterId: undefined });
    }
  }

  for (const [clusterId, members] of memberMap) {
    const cluster = clusterMap.get(clusterId);
    if (cluster) {
      cluster.subRows = members.sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      );
    }
  }

  const sortedClusters = [...clusterMap.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  const sortedOrphans = orphans.sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  return [...sortedClusters, ...sortedOrphans];
}

function paginateTree(tree: TreeRow[], page: number, perPage: number) {
  const topLevels = tree.filter((row) => !row.clusterId);
  const totalPages = Math.max(1, Math.ceil(topLevels.length / perPage));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * perPage;
  const slice = topLevels.slice(offset, offset + perPage);

  const pageIds = new Set(slice.map((r) => r.id));
  const pagedTree: TreeRow[] = [];
  for (const node of tree) {
    if (pageIds.has(node.id)) {
      pagedTree.push(node);
    }
  }

  return { pagedTree, totalPages, safePage };
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

export function DatabaseTable({
  resources,
  totalClusters: _totalClusters, // eslint-disable-line @typescript-eslint/no-unused-vars -- required by interface
  totalInstances: _totalInstances, // eslint-disable-line @typescript-eslint/no-unused-vars -- required by interface
}: DatabaseTableProps) {
  const t = useTranslations();
  const localeValue = useLocale();
  const locale = isAppLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedResource, setSelectedResource] =
    useState<ResourceListViewModel | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean> | true>({});

  const search = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const clustersPerPage = parseInt(searchParams.get("pageSize") ?? "10", 10) || 10;

  useEffect(() => {
    setExpanded({});
  }, [page]);
  const selectedEngines = readMultiSelectValues(searchParams, "resourceSubtype");
  const hasActiveFilters = search.trim().length > 0 || selectedEngines.length > 0;
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const fullTree = useMemo(() => buildTree(resources), [resources]);

  const filteredTree = useMemo(() => {
    let tree = fullTree;

    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      tree = tree.filter((row) => {
        if (row.displayName.toLowerCase().includes(q)) return true;
        if (row.name.toLowerCase().includes(q)) return true;
        if (row.subRows?.some((child) => child.displayName.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    if (selectedEngines.length > 0) {
      tree = tree.filter((row) => {
        if (row.resourceType === "database_cluster") {
          const clusterMembers = row.subRows ?? [];
          return clusterMembers.some((child) => selectedEngines.includes(child.resourceSubtype));
        }
        return selectedEngines.includes(row.resourceSubtype);
      });
    }

    return tree;
  }, [fullTree, search, selectedEngines]);

  const { pagedTree, totalPages, safePage } = useMemo(
    () => paginateTree(filteredTree, page, clustersPerPage),
    [filteredTree, page, clustersPerPage],
  );

  const totalTopLevels = filteredTree.filter((r) => !r.clusterId).length;

  const clusterPageInfo = useMemo((): PageInfo => ({
    page: safePage,
    pageSize: clustersPerPage,
    totalItems: totalTopLevels,
    totalPages,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- clustersPerPage is stable
  }), [safePage, totalTopLevels, totalPages]);

  const availableEngines = useMemo(
    () =>
      Array.from(
        new Set([
          ...ENGINE_OPTIONS,
          ...resources.map((r) => r.resourceSubtype).filter(Boolean),
        ]),
      ).sort(),
    [resources],
  );

  const engineOptions = useMemo(
    () => availableEngines.map((engine) => ({
      value: engine,
      label: formatLabel(engine),
    })),
    [availableEngines],
  );

  const handleRowClick = useCallback((resource: ResourceListViewModel) => {
    setSelectedResource(resource);
  }, []);

  const columns = useMemo(() => [
    columnHelper.display({
      id: "expander",
      size: 32,
      minSize: 32,
      enableHiding: false,
      cell: ({ row }) => {
        if (!row.original.subRows?.length) return null;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              row.toggleExpanded();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
            aria-label={row.getIsExpanded() ? `Collapse ${row.original.displayName}` : `Expand ${row.original.displayName}`}
            aria-expanded={row.getIsExpanded()}
            className="flex size-8 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            {row.getIsExpanded() ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        );
      },
    }),
    columnHelper.accessor("displayName", {
      header: t("common.fields.resource"),
      cell: ({ row }) => {
        const isCluster = row.original.resourceType === "database_cluster";
        const isChild = (row.depth ?? 0) > 0;
        return (
          <div className="flex items-center gap-2">
            {isCluster ? (
              <>
                <DbTypeIcon subtype={row.original.resourceSubtype} />
                <ResourceLink
                  href={`/resources/${row.original.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-foreground"
                >
                  {row.original.displayName}
                </ResourceLink>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  {t("common.fields.cluster")}
                </span>
                {row.original.profileSummary?.nodeCount != null && (
                  <span className="text-xs text-muted-foreground">
                    {row.original.profileSummary.nodeCount} {t("common.fields.nodes").toLowerCase()}
                  </span>
                )}
              </>
            ) : (
              <span className={`flex items-center gap-2${isChild ? " pl-4" : ""}`}>
                <DbTypeIcon subtype={row.original.resourceSubtype} />
                <ResourceLink
                  href={`/resources/${row.original.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {row.original.displayName}
                </ResourceLink>
              </span>
            )}
          </div>
        );
      },
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
    columnHelper.accessor("resourceSubtype", {
      header: t("common.fields.engine"),
      cell: (info) => {
        const subtype = info.getValue();
        return (
          <div className="flex items-center gap-2">
            <DbTypeIcon subtype={subtype} />
            <span className="text-sm text-foreground">
              {formatLabel(subtype)}
            </span>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "status",
      header: t("common.fields.status"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={row.original.healthStatus} tone="health" />
          <StatusBadge status={row.original.lifecycleStatus} tone="lifecycle" />
        </div>
      ),
    }),
    columnHelper.display({
      id: "hostname",
      header: t("common.fields.hostname"),
      cell: ({ row }) => {
        if (row.original.resourceType === "database_cluster") return null;
        return (
          <span className="text-sm text-muted-foreground">
            {row.original.profileSummary?.hostname ?? "—"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "port",
      header: t("common.fields.port"),
      cell: ({ row }) => {
        if (row.original.resourceType !== "database_instance") return null;
        return (
          <span className="text-sm text-muted-foreground">
            {row.original.profileSummary?.port ?? "—"}
          </span>
        );
      },
    }),
    columnHelper.accessor("updatedAt", {
      header: t("common.fields.updated"),
      cell: (info) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap" title={formatDateTime(info.getValue(), locale)}>
          {formatRelativeDateTime(info.getValue(), locale)}
        </span>
      ),
    }),
  ], [locale, t]);

  const table = useReactTable({
    data: pagedTree,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
    getRowCanExpand: (row) => (row.original.subRows?.length ?? 0) > 0,
    getRowId: (row) => String(row.id),
    state: { expanded },
    onExpandedChange: setExpanded,
  });

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
    [searchParams, router, pathname],
  );

  const debouncedSearch = useDebounceCallback(
    (value: string) => {
      replaceSearchParams({ q: value.trim() || null });
    },
    300,
  );

  return (
    <>
      <DataTableShell
        title={t("tables.databases.title")}
        description={t("tables.databases.description")}
        controls={
          <>
            <Input
              value={searchDraft}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearchDraft(nextValue);
                debouncedSearch(nextValue);
              }}
              placeholder={t("tables.databases.searchPlaceholder")}
              className="h-9 w-[220px] border-border bg-background py-2"
            />
            <MultiSelectFilter
              label={t("common.fields.engine")}
              options={engineOptions}
              selectedValues={selectedEngines}
              onValuesChange={(values) =>
                updateMultiSelectParams(pathname, router, searchParams, "resourceSubtype", values)
              }
              className="w-[180px]"
            />
          </>
        }
        pagination={<PaginationControls pageInfo={clusterPageInfo} />}
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
                    title={hasActiveFilters ? t("tables.databases.emptyFilterTitle") : t("tables.databases.emptyTitle")}
                    description={hasActiveFilters ? t("tables.databases.emptyFilterDescription") : t("tables.databases.emptyDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isCluster = row.original.resourceType === "database_cluster";
                return (
                  <TableRow
                    key={row.id}
                    role="row"
                    tabIndex={0}
                    aria-label={`View details for ${row.original.displayName}`}
                    className={`cursor-pointer transition-colors border-l-2${
                      isCluster ? " border-l-primary/40 bg-muted/30 hover:bg-muted/40" : " border-l-transparent"
                    }`}
                    onClick={() => handleRowClick(row.original)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.defaultPrevented) {
                        handleRowClick(row.original);
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="py-1"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </DataTableShell>

      <ResourceDetailSheetLoader
        open={Boolean(selectedResource)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedResource(null);
          }
        }}
        resource={selectedResource}
      />
    </>
  );
}
