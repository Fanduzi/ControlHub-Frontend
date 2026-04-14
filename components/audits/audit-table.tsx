"use client";

import Link from "next/link";
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
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import { formatDateTime, formatLabel } from "@/lib/format";
import type { PageInfo } from "@/types/resource";
import type { AuditEventViewModel } from "@/types/view-models";

type AuditTableProps = {
  events: AuditEventViewModel[];
  pageInfo: PageInfo;
};

const columnHelper = createColumnHelper<AuditEventViewModel>();

const KNOWN_AUDIT_EVENT_TYPES = [
  "resource.created",
  "relation.created",
  "resource.updated",
] as const;

const KNOWN_AUDIT_RESULTS = ["success", "warning", "error"] as const;

export function AuditTable({ events, pageInfo }: AuditTableProps) {
  const t = useTranslations();
  const localeValue = useLocale();
  const locale = isAppLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const eventType = searchParams.get("eventType") ?? "all";
  const result = searchParams.get("result") ?? "all";

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

  const eventTypes = Array.from(
    new Set([
      ...KNOWN_AUDIT_EVENT_TYPES,
      ...events.map((event) => event.eventType),
    ]),
  ).sort();
  const results = Array.from(
    new Set([...KNOWN_AUDIT_RESULTS, ...events.map((event) => event.result)]),
  ).sort();

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
      cell: (info) => formatDateTime(info.getValue(), locale),
    }),
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: events,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DataTableShell
      title={t("tables.audits.title")}
      description={t("tables.audits.description")}
      controls={
        <>
          <Select
            value={eventType}
            onValueChange={(value) =>
              replaceSearchParams({
                eventType: !value || value === "all" ? null : value,
              })
            }
          >
            <SelectTrigger
              aria-label={t("tables.audits.filterEventType")}
              className="h-9 w-[180px] border-border bg-background"
            >
              <SelectValue placeholder={t("tables.audits.filterEventType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tables.audits.allEventTypes")}</SelectItem>
              {eventTypes.map((value) => (
                <SelectItem key={value} value={value}>
                  {getEventTypeLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={result}
            onValueChange={(value) =>
              replaceSearchParams({
                result: !value || value === "all" ? null : value,
              })
            }
          >
            <SelectTrigger
              aria-label={t("tables.audits.filterResult")}
              className="h-9 w-[160px] border-border bg-background"
            >
              <SelectValue placeholder={t("tables.audits.filterResult")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tables.audits.allResults")}</SelectItem>
              {results.map((value) => (
                <SelectItem key={value} value={value}>
                  {getResultLabel(value)}
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
