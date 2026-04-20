"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDebounceCallback } from "@/hooks/use-debounce";
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
import { MultiSelectFilter, readMultiSelectValues, buildMultiSelectParams } from "@/components/blocks/multi-select-filter";
import { PaginationControls } from "@/components/blocks/pagination-controls";
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
import { formatDateTime, formatLabel } from "@/lib/format";
import type { PageInfo } from "@/types/resource";
import type { ResourceListViewModel } from "@/types/view-models";

import { ResourceDetailSheetLoader } from "@/components/resources/resource-detail-sheet-loader";

type DatabaseTableProps = {
  resources: ResourceListViewModel[];
  pageInfo: PageInfo;
};

const columnHelper = createColumnHelper<ResourceListViewModel>();

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
  pageInfo,
}: DatabaseTableProps) {
  const t = useTranslations();
  const localeValue = useLocale();
  const locale = isAppLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedResource, setSelectedResource] =
    useState<ResourceListViewModel | null>(null);

  const search = searchParams.get("q") ?? "";
  const selectedEngines = readMultiSelectValues(searchParams, "resourceSubtype");
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  // Collect unique engine/subtype values from current data
  const availableEngines = Array.from(
    new Set([
      ...ENGINE_OPTIONS,
      ...resources.map((r) => r.resourceSubtype).filter(Boolean),
    ]),
  ).sort();

  const engineOptions = availableEngines.map((engine) => ({
    value: engine,
    label: formatLabel(engine),
  }));

  const columns = [
    columnHelper.accessor("displayName", {
      header: t("common.fields.resource"),
      cell: ({ row }) => (
        <Link
          href={`/resources/${row.original.id}`}
          className="font-medium text-foreground hover:text-primary hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring/50 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.displayName}
        </Link>
      ),
    }),
    columnHelper.accessor("environmentName", {
      header: t("common.fields.environment"),
    }),
    columnHelper.accessor("ownerName", {
      header: t("common.fields.owner"),
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
      header: t("common.fields.health"),
      cell: ({ row }) => (
        <StatusBadge status={row.original.healthStatus} tone="health" />
      ),
    }),
    columnHelper.accessor("updatedAt", {
      header: t("common.fields.updated"),
      cell: (info) => formatDateTime(info.getValue(), locale),
    }),
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: resources,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function replaceSearchParams(updates: Record<string, string | null>) {
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
  }

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
                    title={t("tables.databases.emptyTitle")}
                    description={t("tables.databases.emptyDescription")}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
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
