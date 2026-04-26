"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { ResourceLink } from "@/components/blocks/resource-link";
import { DataTableShell } from "@/components/blocks/data-table-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { MultiSelectFilter, readMultiSelectValues, buildMultiSelectParams } from "@/components/blocks/multi-select-filter";
import { PaginationControls } from "@/components/blocks/pagination-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import { formatDateTime, formatLabel, formatRelativeDateTime } from "@/lib/format";
import { AUDIT_RESULT_DOT, AUDIT_RESULT_BORDER } from "@/lib/severity-colors";
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

export function AuditTable({ events, pageInfo }: AuditTableProps) {
  const t = useTranslations();
  const localeValue = useLocale();
  const locale = isAppLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedEventTypes = readMultiSelectValues(searchParams, "eventType");
  const selectedResults = readMultiSelectValues(searchParams, "result");
  const [search, setSearch] = useState("");

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

  const eventTypes = Array.from(
    new Set([
      ...KNOWN_AUDIT_EVENT_TYPES,
      ...events.map((event) => event.eventType),
    ]),
  ).sort();

  const results = Array.from(
    new Set([...KNOWN_AUDIT_RESULTS, ...events.map((event) => event.result)]),
  ).sort();

  const eventTypeOptions = eventTypes.map((v) => ({
    value: v,
    label: getEventTypeLabel(v),
  }));

  const resultOptions = results.map((v) => ({
    value: v,
    label: getResultLabel(v),
  }));

  const columns = [
    columnHelper.accessor("eventType", {
      header: t("common.fields.action"),
      cell: (info) => {
        const result = info.row.original.result;
        const dotColor = AUDIT_RESULT_DOT[result] ?? "bg-muted-foreground";
        return (
          <span className="inline-flex items-center gap-2">
            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
            {getEventTypeLabel(info.getValue())}
          </span>
        );
      },
    }),
    columnHelper.accessor("targetResourceName", {
      header: t("common.fields.resource"),
      cell: (info) =>
        info.row.original.targetResourceId ? (
          <ResourceLink href={`/resources/${info.row.original.targetResourceId}`}>
            {info.getValue()}
          </ResourceLink>
        ) : (
          <span className="text-sm text-foreground">{info.getValue()}</span>
        ),
    }),
    columnHelper.accessor("actorLabel", {
      header: t("common.fields.actor"),
      cell: (info) => (
        <span className="text-sm text-muted-foreground">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("environmentLabel", {
      header: t("common.fields.environment"),
      cell: (info) => (
        <span className="text-sm text-muted-foreground">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("createdAt", {
      header: t("common.fields.timestamp"),
      cell: (info) => (
        <span
          className="whitespace-nowrap text-sm text-muted-foreground"
          title={formatDateTime(info.getValue(), locale)}
        >
          {formatRelativeDateTime(info.getValue(), locale)}
        </span>
      ),
    }),
  ];

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter((event) =>
      event.targetResourceName.toLowerCase().includes(q) ||
      event.actorLabel.toLowerCase().includes(q) ||
      getEventTypeLabel(event.eventType).toLowerCase().includes(q) ||
      event.environmentLabel.toLowerCase().includes(q)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getEventTypeLabel is derived from static translations
  }, [events, search]);

  const table = useReactTable({
    data: filteredEvents,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <DataTableShell
      title={t("tables.audits.title")}
      description={t("tables.audits.description")}
      controls={
        <>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("tables.audits.searchPlaceholder")}
            className="h-9 w-[240px] border-border bg-background py-2"
          />
          <MultiSelectFilter
            label={t("tables.audits.filterEventType")}
            options={eventTypeOptions}
            selectedValues={selectedEventTypes}
            onValuesChange={(values) =>
              updateMultiSelectParams(pathname, router, searchParams, "eventType", values)
            }
            className="w-[200px]"
          />
          <MultiSelectFilter
            label={t("tables.audits.filterResult")}
            options={resultOptions}
            selectedValues={selectedResults}
            onValuesChange={(values) =>
              updateMultiSelectParams(pathname, router, searchParams, "result", values)
            }
            className="w-[180px]"
          />
        </>
      }
      pagination={<PaginationControls pageInfo={pageInfo} />}
    >
      <div className="overflow-x-auto">
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
                <TableRow
                  key={row.id}
                  className={`transition-colors hover:bg-muted/30 ${AUDIT_RESULT_BORDER[row.original.result] ?? ""}`}
                >
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
      </div>
    </DataTableShell>
  );
}
