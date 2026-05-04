"use client";

import { useLocale, useTranslations } from "next-intl";

import type { AuditEventViewModel } from "@/types/view-models";

import { EmptyState } from "@/components/blocks/empty-state";
import type { AppLocale } from "@/i18n/locales";
import { formatDateTime, formatLabel } from "@/lib/format";

type ActivityTimelineProps = {
  events: AuditEventViewModel[];
  emptyTitle?: string;
  emptyDescription?: string;
  locale?: AppLocale;
};

export function ActivityTimeline({
  events,
  emptyTitle,
  emptyDescription,
  locale,
}: ActivityTimelineProps) {
  const t = useTranslations("activityTimeline");
  const detectedLocale = useLocale() as AppLocale;
  const currentLocale = locale ?? detectedLocale;

  function getEventTypeLabel(eventType: string) {
    const key = eventType.replaceAll(".", "_");

    return t.has(`eventTypes.${key}`)
      ? t(`eventTypes.${key}`)
      : formatLabel(eventType);
  }

  function getResultLabel(result: string) {
    return t.has(`results.${result}`) ? t(`results.${result}`) : formatLabel(result);
  }

  if (!events.length) {
    return (
      <EmptyState
        title={emptyTitle ?? t("emptyTitle")}
        description={emptyDescription ?? t("emptyDescription")}
      />
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 text-sm">
          <div className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {formatDateTime(event.createdAt, currentLocale)}
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-foreground">
                {getEventTypeLabel(event.eventType)}
              </p>
              <p className="text-xs text-muted-foreground">{event.actorLabel}</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("summary", {
                eventType: getEventTypeLabel(event.eventType),
                result: getResultLabel(event.result),
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
