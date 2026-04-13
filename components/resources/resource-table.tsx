"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableShell } from "@/components/blocks/data-table-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { StatusBadge } from "@/components/blocks/status-badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatLabel } from "@/lib/format";
import type { ResourceListViewModel } from "@/types/view-models";
import type { ResourceTypeDefinition } from "@/types/settings";
import { useEnvironment } from "@/components/providers/environment-provider";

import { ResourceDetailSheetLoader } from "./resource-detail-sheet-loader";

type ResourceTableProps = {
  resources: ResourceListViewModel[];
  resourceTypes: ResourceTypeDefinition[];
};

const columnHelper = createColumnHelper<ResourceListViewModel>();

export function ResourceTable({
  resources,
  resourceTypes,
}: ResourceTableProps) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [resourceType, setResourceType] = useState("all");
  const [selectedResource, setSelectedResource] =
    useState<ResourceListViewModel | null>(null);
  const { currentEnvironmentId } = useEnvironment();

  const filteredResources = useMemo(
    () =>
      resources.filter((resource) => {
        const matchesEnv =
          !currentEnvironmentId ||
          resource.environmentId === currentEnvironmentId;
        const matchesSearch =
          !search ||
          resource.displayName.toLowerCase().includes(search.toLowerCase()) ||
          resource.name.toLowerCase().includes(search.toLowerCase()) ||
          resource.ownerName.toLowerCase().includes(search.toLowerCase());
        const matchesType =
          resourceType === "all" || resource.resourceType === resourceType;

        return matchesEnv && matchesSearch && matchesType;
      }),
    [resources, currentEnvironmentId, search, resourceType],
  );

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
          <StatusBadge status={row.original.healthStatus} tone="health" />
          <StatusBadge status={row.original.lifecycleStatus} tone="lifecycle" />
        </div>
      ),
    }),
    columnHelper.accessor("updatedAt", {
      header: t("common.fields.updated"),
      cell: (info) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(info.getValue())}
        </span>
      ),
    }),
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredResources,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleSheetOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedResource(null);
    }
  }, []);

  return (
    <>
      <DataTableShell
        title={t("tables.resources.title")}
        description={t("tables.resources.description")}
        controls={
          <>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("tables.resources.searchPlaceholder")}
              className="h-9 w-[240px] border-border bg-background py-2"
            />
            <Select
              value={resourceType}
              onValueChange={(value) => setResourceType(value ?? "all")}
            >
              <SelectTrigger className="h-9 w-[180px] border-border bg-background">
                <SelectValue placeholder={t("tables.resources.filterType")} />
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
          </>
        }
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
                  className="cursor-pointer"
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
