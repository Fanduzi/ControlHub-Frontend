"use client";

import { useState } from "react";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableShell } from "@/components/blocks/data-table-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { StatusBadge } from "@/components/blocks/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { ResourceViewModel } from "@/types/view-models";

import { ResourceDetailSheet } from "@/components/resources/resource-detail-sheet";

type DatabaseTableProps = {
  resources: ResourceViewModel[];
};

const columnHelper = createColumnHelper<ResourceViewModel>();

const columns = [
  columnHelper.accessor("displayName", {
    header: "Database Asset",
    cell: (info) => (
      <div className="space-y-1">
        <p className="font-medium text-foreground">{info.getValue()}</p>
        <p className="text-xs text-muted-foreground">
          {info.row.original.profile.endpoint ??
            info.row.original.profile.engine}
        </p>
      </div>
    ),
  }),
  columnHelper.accessor("environmentName", {
    header: "Environment",
  }),
  columnHelper.accessor("ownerName", {
    header: "Owner",
  }),
  columnHelper.accessor("resourceSubtype", {
    header: "Engine",
    cell: (info) => (
      <span className="text-sm text-foreground">
        {info.row.original.profile.engine}
      </span>
    ),
  }),
  columnHelper.display({
    id: "status",
    header: "Health",
    cell: ({ row }) => (
      <StatusBadge status={row.original.healthStatus} tone="health" />
    ),
  }),
  columnHelper.accessor("updatedAt", {
    header: "Updated",
    cell: (info) => formatDateTime(info.getValue()),
  }),
];

export function DatabaseTable({ resources }: DatabaseTableProps) {
  const [selectedResource, setSelectedResource] =
    useState<ResourceViewModel | null>(null);

  const table = useReactTable({
    data: resources,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <DataTableShell
        title="Database resources"
        description="Cluster and instance records share the same resource backbone with database-specific emphasis."
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
                    title="No database resources"
                    description="No database instances or clusters have been registered yet."
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

      <ResourceDetailSheet
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
