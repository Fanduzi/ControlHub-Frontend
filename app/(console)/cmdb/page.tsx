import { getLocale, getTranslations } from "next-intl/server";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import { StatusBadge } from "@/components/blocks/status-badge";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import { formatDateTime } from "@/lib/format";
import { listResourceViewModels } from "@/lib/view-models";

export default async function CmdbPage() {
  const [localeValue, t] = await Promise.all([
    getLocale(),
    getTranslations(),
  ]);
  const locale = isAppLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const resources = await listResourceViewModels();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.cmdb.eyebrow")}
        title={t("pages.cmdb.title")}
        description={t("pages.cmdb.description")}
      />

      <DetailPanel
        title={t("pages.cmdb.records.title")}
        description={t("pages.cmdb.records.description")}
      >
        {resources.length === 0 ? (
          <EmptyState
            title={t("pages.cmdb.records.emptyTitle")}
            description={t("pages.cmdb.records.emptyDescription")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-medium">{t("common.fields.resource")}</th>
                  <th className="py-3 pr-4 font-medium">{t("common.fields.owner")}</th>
                  <th className="py-3 pr-4 font-medium">{t("common.fields.environment")}</th>
                  <th className="py-3 pr-4 font-medium">{t("common.fields.source")}</th>
                  <th className="py-3 pr-4 font-medium">{t("common.fields.lifecycle")}</th>
                  <th className="py-3 font-medium">{t("common.fields.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => (
                  <tr
                    key={resource.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="py-3 pr-4">
                      <p className="font-medium text-foreground">
                        {resource.displayName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resource.id}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-foreground">
                      {resource.ownerName}
                    </td>
                    <td className="py-3 pr-4 text-foreground">
                      {resource.environmentName}
                    </td>
                    <td className="py-3 pr-4 text-foreground">
                      {resource.source}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge
                        status={resource.lifecycleStatus}
                        tone="lifecycle"
                      />
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {formatDateTime(resource.updatedAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
