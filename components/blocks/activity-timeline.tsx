import type { AuditEventViewModel } from "@/types/view-models";

import { EmptyState } from "@/components/blocks/empty-state";
import type { AppLocale } from "@/i18n/locales";
import { formatDateTime } from "@/lib/format";

type ActivityTimelineProps = {
  events: AuditEventViewModel[];
  emptyTitle?: string;
  emptyDescription?: string;
  locale?: AppLocale;
};

export function ActivityTimeline({
  events,
  emptyTitle = "No audit activity yet",
  emptyDescription = "Recent resource changes will appear here once the backend audit feed is connected.",
  locale,
}: ActivityTimelineProps) {
  if (!events.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 text-sm">
          <div className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {formatDateTime(event.createdAt, locale)}
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-foreground">{event.eventType}</p>
              <p className="text-xs text-muted-foreground">{event.actorLabel}</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{event.summary}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
