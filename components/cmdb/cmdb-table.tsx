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
import { Badge } from "@/components/ui/badge";
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
import { ResourceDetailSheetLoader } from "@/components/resources/resource-detail-sheet-loader";
import type { PageInfo } from "@/types/resource";
import type { ResourceListViewModel } from "@/types/view-models";
import type { Environment } from "@/types/settings";

type CmdbTableProps = {
  resources: ResourceListViewModel[];
  pageInfo: PageInfo;
  environments: Environment[];
};

const columnHelper = createColumnHelper<ResourceListViewModel>();

export function CmdbTable({
  resources,
  pageInfo,
  environments,
}: CmdbTableProps) {
  const t = useTranslations();
  const localeValue = useLocale();
  const locale = isAppLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedResource, setSelectedResource] =
    useState<ResourceListViewModel | null>(null);

  const search = searchParams.get("q") ?? "";
  const environmentSlug = searchParams.get("environment") ?? "all";
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const columns = [
    columnHelper.accessor("displayName", {
      header: t("common.fields.displayName"),
      cell: ({ row }) => (
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            {row.original.displayName}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatLabel(row.original.resourceType)}
            {" \u00B7 "}
            {formatLabel(row.original.resourceSubtype)}
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
    columnHelper.accessor("externalId", {
      header: t("common.fields.externalId"),
      cell: (info) => (
        <span className="font-mono text-xs text-muted-foreground">
          {info.getValue() || "\u2014"}
        </span>
      ),
    }),
    columnHelper.accessor("source", {
      header: t("common.fields.source"),
      cell: (info) => (
        <span className="text-sm text-foreground">
          {formatLabel(info.getValue())}
        </span>
      ),
    }),
    columnHelper.display({
      id: "archiveState",
      header: t("common.fields.status"),
      cell: ({ row }) =>
        row.original.isArchived ? (
          <Badge variant="secondary">{t("common.actions.archived")}</Badge>
        ) : null,
    }),
    columnHelper.accessor("labels", {
      header: t("common.fields.labels"),
      cell: (info) => {
        const count = Object.keys(info.getValue()).length;
        return count > 0 ? (
          <Badge variant="outline">{count}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{"\u2014"}</span>
        );
      },
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

      // Always clean up legacy environmentId from URL
      params.delete("environmentId");

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

  const envTriggerText =
    environmentSlug === "all"
      ? t("pages.cmdb.records.allEnvironments")
      : environments.find((e) => e.slug === environmentSlug)?.name ??
        formatLabel(environmentSlug);

  return (
    <>
      <DataTableShell
        title={t("pages.cmdb.records.title")}
        description={t("pages.cmdb.records.description")}
        controls={
          <>
            <Input
              value={searchDraft}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearchDraft(nextValue);
                replaceSearchParams({
                  q: nextValue.trim() ? nextValue.trim() : null,
                });
              }}
              placeholder={t("pages.cmdb.searchPlaceholder")}
              className="h-9 w-[260px] border-border bg-background py-2"
            />
            <Select
              value={environmentSlug}
              onValueChange={(value) =>
                replaceSearchParams({
                  environment:
                    !value || value === "all" ? null : value,
                })
              }
            >
              <SelectTrigger
                aria-label={t("common.fields.environment")}
                className="h-9 w-[180px] border-border bg-background"
              >
                <span className="truncate">{envTriggerText}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("pages.cmdb.records.allEnvironments")}
                </SelectItem>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.slug}>
                    {env.name}
                  </SelectItem>
                ))}
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
                    title={t("pages.cmdb.records.emptyTitle")}
                    description={t("pages.cmdb.records.emptyDescription")}
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
    </>
  );
}
