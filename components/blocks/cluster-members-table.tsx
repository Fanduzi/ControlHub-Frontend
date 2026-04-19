"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/blocks/status-badge";
import type { ClusterMember } from "@/types/resource";

type ClusterMembersTableProps = {
  members: ClusterMember[];
};

export function ClusterMembersTable({ members }: ClusterMembersTableProps) {
  const t = useTranslations();

  if (!members || members.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {t("pages.resourceDetail.clusterMembers.empty")}
      </p>
    );
  }

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
              {t("pages.resourceDetail.clusterMembers.health")}
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              {t("pages.resourceDetail.clusterMembers.lifecycle")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {members.map((member) => (
            <tr key={member.id} className="group">
              <td className="px-4 py-2">
                <Link
                  href={`/resources/${member.id}`}
                  className="font-medium text-foreground underline-offset-2 hover:text-primary/80 hover:underline"
                >
                  {member.displayName}
                </Link>
              </td>
              <td className="px-4 py-2 capitalize text-muted-foreground">
                {member.resourceSubtype}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                {member.profileSummary?.hostname ?? "-"}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                {member.profileSummary?.port ?? "-"}
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={member.healthStatus} tone="health" />
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={member.lifecycleStatus} tone="lifecycle" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
