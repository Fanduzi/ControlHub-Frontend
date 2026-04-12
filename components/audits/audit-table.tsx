"use client";

import Link from "next/link";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTableShell } from "@/components/blocks/data-table-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { AuditEventViewModel } from "@/types/view-models";

type AuditTableProps = {
  events: AuditEventViewModel[];
};

const columnHelper = createColumnHelper<AuditEventViewModel>();

const columns = [
  columnHelper.accessor("eventType", {
    header: "Action",
  }),
  columnHelper.accessor("targetResourceName", {
    header: "Resource",
    cell: (info) =>
      info.row.original.targetResourceId ? (
        <Link
          href={`/resources/${info.row.original.targetResourceId}`}
          className="font-medium text-foreground hover:text-sky-700"
        >
          {info.getValue()}
        </Link>
      ) : (
        <span className="text-sm text-foreground">{info.getValue()}</span>
      ),
  }),
  columnHelper.accessor("actorLabel", {
    header: "Actor",
  }),
  columnHelper.accessor("environmentLabel", {
    header: "Environment",
  }),
  columnHelper.accessor("summary", {
    header: "Change Summary",
    cell: (info) => (
      <span className="block max-w-xl text-sm text-muted-foreground">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Timestamp",
    cell: (info) => formatDateTime(info.getValue()),
  }),
];

export function AuditTable({ events }: AuditTableProps) {
  const table = useReactTable({
    data: events,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DataTableShell
      title="Audit feed"
      description="Baseline asset mutations are captured as append-only operational history."
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
                  title="No audit events"
                  description="Audit records will appear here once resource changes are captured."
                />
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}
