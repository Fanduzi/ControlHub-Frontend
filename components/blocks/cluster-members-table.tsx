"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { ResourceLink } from "@/components/blocks/resource-link";
import { StatusBadge } from "@/components/blocks/status-badge";
import { sortClusterMembersForOperations } from "@/lib/database-operator-workbench";
import { formatRole } from "@/lib/format";
import type { ClusterMember } from "@/types/resource";

type ClusterMembersTableProps = {
  members: ClusterMember[];
};

function isAbnormalMember(member: ClusterMember): boolean {
  return (
    member.healthStatus === "critical" ||
    member.healthStatus === "warning" ||
    member.healthStatus === "unknown" ||
    member.lifecycleStatus === "stopped" ||
    member.lifecycleStatus === "degraded"
  );
}

export function ClusterMembersTable({ members }: ClusterMembersTableProps) {
  const t = useTranslations();
  const sortedMembers = sortClusterMembersForOperations(members);

  if (!sortedMembers || sortedMembers.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {t("pages.resourceDetail.clusterMembers.empty")}
      </p>
    );
  }

  const hasAbnormal = sortedMembers.some(isAbnormalMember);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("pages.resourceDetail.clusterMembers.instance")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("pages.resourceDetail.clusterMembers.subtype")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("pages.resourceDetail.clusterMembers.hostname")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("pages.resourceDetail.clusterMembers.port")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("pages.resourceDetail.clusterMembers.role")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("pages.resourceDetail.clusterMembers.health")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("pages.resourceDetail.clusterMembers.lifecycle")}
            </th>
            {hasAbnormal && (
              <th className="px-4 py-2 font-medium text-muted-foreground" />
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedMembers.map((member) => (
            <tr key={member.id} className="group">
              <td className="px-4 py-2">
                <ResourceLink href={`/resources/${member.id}`}>
                  {member.displayName}
                </ResourceLink>
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-1.5">
                  <DbTypeIcon subtype={member.resourceSubtype} className="size-3.5" />
                  <span className="capitalize text-muted-foreground">
                    {member.resourceSubtype}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                {member.profileSummary?.hostname
                  ? member.profileSummary.hostname
                  : t("diagnostics.missing.connection")}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                {member.profileSummary?.port ?? t("diagnostics.missing.connection")}
              </td>
              <td className="px-4 py-2 text-xs capitalize text-muted-foreground">
                {member.profileSummary?.role
                  ? formatRole(member.profileSummary.role, t)
                  : t("diagnostics.missing.role")}
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={member.healthStatus} tone="health" />
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={member.lifecycleStatus} tone="lifecycle" />
              </td>
              {hasAbnormal && (
                <td className="px-4 py-2">
                  {isAbnormalMember(member) ? (
                    <Link
                      href={`/resources/${member.id}?topologyDepth=2&topologyExpanded=1`}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("diagnostics.topology.viewTopology")}
                    </Link>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
