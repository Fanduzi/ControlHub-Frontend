"use client";

import { useTranslations } from "next-intl";

import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { EmptyState } from "@/components/blocks/empty-state";
import { ResourceLink } from "@/components/blocks/resource-link";
import { StatusBadge } from "@/components/blocks/status-badge";
import { formatLabel } from "@/lib/format";
import { localizeResourceType } from "@/lib/resource-summary";
import type { ResourceRelationViewModel } from "@/types/view-models";

type DeployedResourcesCardProps = {
  relations: ResourceRelationViewModel[];
};

export function DeployedResourcesCard({ relations }: DeployedResourcesCardProps) {
  const t = useTranslations("pages.resourceDetail.deployedResources");

  const deployed = relations.filter(
    (r) => r.relationType === "runs_on" && r.direction === "incoming",
  );

  if (!deployed.length) {
    return (
      <EmptyState
        title={t("empty")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("resource")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("type")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("health")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {deployed.map((relation) => {
            const related = relation.relatedResource;
            const displayName = related?.displayName ?? relation.relatedResourceName;

            return (
              <tr key={relation.id} className="group">
                <td className="px-4 py-2">
                  {related ? (
                    <ResourceLink href={`/resources/${related.id}`}>
                      {displayName}
                    </ResourceLink>
                  ) : (
                    <span className="font-medium text-foreground">{displayName}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {related && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium lowercase tracking-normal text-muted-foreground">
                      {(related.resourceType === "database_instance" || related.resourceType === "database_cluster" || related.resourceType === "database_proxy") && (
                        <DbTypeIcon subtype={related.resourceSubtype} className="size-3.5" />
                      )}
                      {localizeResourceType(related.resourceType, t)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {related ? (
                    <StatusBadge status={related.healthStatus} tone="health" />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
