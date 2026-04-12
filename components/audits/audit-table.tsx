"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

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
import { formatDateTime, formatLabel } from "@/lib/format";
import type { AuditEventViewModel } from "@/types/view-models";

type AuditTableProps = {
  events: AuditEventViewModel[];
};

const columnHelper = createColumnHelper<AuditEventViewModel>();

export function AuditTable({ events }: AuditTableProps) {
  const t = useTranslations();

  function getEventTypeLabel(eventType: string) {
    const key = eventType.replaceAll(".", "_");

    return t.has(`activityTimeline.eventTypes.${key}`)
      ? t(`activityTimeline.eventTypes.${key}`)
      : formatLabel(eventType);
  }

  function getResultLabel(result: string) {
    return t.has(`activityTimeline.results.${result}`)
      ? t(`activityTimeline.results.${result}`)
      : formatLabel(result);
  }

  const columns = [
    columnHelper.accessor("eventType", {
      header: t("common.fields.action"),
      cell: (info) => getEventTypeLabel(info.getValue()),
    }),
    columnHelper.accessor("targetResourceName", {
      header: t("common.fields.resource"),
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
      header: t("common.fields.actor"),
    }),
    columnHelper.accessor("environmentLabel", {
      header: t("common.fields.environment"),
    }),
    columnHelper.accessor("summary", {
      header: t("common.fields.changeSummary"),
      cell: ({ row }) => (
        <span className="block max-w-xl text-sm text-muted-foreground">
          {t("activityTimeline.summary", {
            eventType: getEventTypeLabel(row.original.eventType),
            result: getResultLabel(row.original.result),
          })}
        </span>
      ),
    }),
    columnHelper.accessor("createdAt", {
      header: t("common.fields.timestamp"),
      cell: (info) => formatDateTime(info.getValue()),
    }),
  ];

  const table = useReactTable({
    data: events,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DataTableShell
      title={t("tables.audits.title")}
      description={t("tables.audits.description")}
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
                    title={t("tables.audits.emptyTitle")}
                    description={t("tables.audits.emptyDescription")}
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
