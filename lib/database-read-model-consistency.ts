import type { ClusterMember, TopologyResponse } from "@/types/resource";
import type { ResourceDetailViewModel } from "@/types/view-models";

export type ConsistencyStatus = "ok" | "warning" | "unknown";

export type ConsistencyIssueKind =
  | "missing_profile"
  | "missing_relation"
  | "topology_mismatch";

export type ConsistencyIssue = {
  id: string;
  kind: ConsistencyIssueKind;
  severity: "warning" | "unknown";
  messageKey: string;
  resourceId?: number;
  resourceName?: string;
};

export type ClusterConsistencyResult = {
  status: ConsistencyStatus;
  counts: {
    members: number;
    topologyDatabaseNodes: number;
  };
  issues: ConsistencyIssue[];
};

export type InstanceConsistencyResult = {
  status: ConsistencyStatus;
  facts: {
    parentClusterId?: number;
    parentClusterName?: string;
    role?: string;
    connection?: string;
  };
  issues: ConsistencyIssue[];
};

function hasConnection(profile: ClusterMember["profileSummary"]): boolean {
  return Boolean(profile?.hostname && profile.port != null);
}

function databaseInstanceTopologyIds(topology?: TopologyResponse): Set<number> {
  const ids = new Set<number>();
  for (const node of topology?.nodes ?? []) {
    if (node.resourceType === "database_instance") {
      ids.add(Number(node.id));
    }
  }
  return ids;
}

function toStatus(issues: ConsistencyIssue[]): ConsistencyStatus {
  if (issues.length === 0) return "ok";
  return issues.some((issue) => issue.severity === "warning") ? "warning" : "unknown";
}

export function buildClusterConsistency({
  resource,
  members,
  topology,
}: {
  resource: ResourceDetailViewModel;
  members: ClusterMember[];
  topology?: TopologyResponse;
}): ClusterConsistencyResult {
  const issues: ConsistencyIssue[] = [];
  const topologyInstanceIds = databaseInstanceTopologyIds(topology);
  const memberIds = new Set(members.map((m) => m.id));

  // Build set of member IDs that have a member_of relation to this cluster
  const relatedMemberIds = new Set<number>();
  for (const rel of resource.relations) {
    if (rel.relationType === "member_of") {
      if (rel.direction === "incoming" && rel.relatedResourceId) {
        relatedMemberIds.add(rel.relatedResourceId);
      }
      if (rel.fromResourceId && rel.toResourceId === resource.id) {
        relatedMemberIds.add(rel.fromResourceId);
      }
    }
  }
  const hasRelations = resource.relations.length > 0;

  for (const member of members) {
    if (!member.profileSummary?.role) {
      issues.push({
        id: `member-role-missing-${member.id}`,
        kind: "missing_profile",
        severity: "warning",
        messageKey: "databaseConsistency.issues.memberRoleMissing",
        resourceId: member.id,
        resourceName: member.displayName,
      });
    }

    if (!hasConnection(member.profileSummary)) {
      issues.push({
        id: `member-connection-missing-${member.id}`,
        kind: "missing_profile",
        severity: "warning",
        messageKey: "databaseConsistency.issues.memberConnectionMissing",
        resourceId: member.id,
        resourceName: member.displayName,
      });
    }

    if (hasRelations && !relatedMemberIds.has(member.id)) {
      issues.push({
        id: `member-relation-missing-${member.id}`,
        kind: "missing_relation",
        severity: "warning",
        messageKey: "databaseConsistency.issues.memberRelationMissing",
        resourceId: member.id,
        resourceName: member.displayName,
      });
    }

    if (topology && !topologyInstanceIds.has(member.id)) {
      issues.push({
        id: `member-missing-from-topology-${member.id}`,
        kind: "topology_mismatch",
        severity: "warning",
        messageKey: "databaseConsistency.issues.memberMissingFromTopology",
        resourceId: member.id,
        resourceName: member.displayName,
      });
    }
  }

  if (topology) {
    for (const topologyId of topologyInstanceIds) {
      if (!memberIds.has(topologyId)) {
        issues.push({
          id: `topology-only-node-${topologyId}`,
          kind: "topology_mismatch",
          severity: "warning",
          messageKey: "databaseConsistency.issues.topologyOnlyNode",
          resourceId: topologyId,
        });
      }
    }
  }

  return {
    status: toStatus(issues),
    counts: {
      members: members.length,
      topologyDatabaseNodes: topologyInstanceIds.size,
    },
    issues,
  };
}

export function buildInstanceConsistency({
  resource,
  topology,
}: {
  resource: ResourceDetailViewModel;
  topology?: TopologyResponse;
}): InstanceConsistencyResult {
  const issues: ConsistencyIssue[] = [];
  const role = resource.profileSummary?.role;
  const hostname = resource.profileSummary?.hostname;
  const port = resource.profileSummary?.port;

  if (!resource.clusterInfo) {
    issues.push({
      id: "instance-parent-cluster-missing",
      kind: "missing_relation",
      severity: "warning",
      messageKey: "databaseConsistency.issues.instanceParentClusterMissing",
      resourceId: resource.id,
      resourceName: resource.displayName,
    });
  }

  if (!role) {
    issues.push({
      id: "instance-role-missing",
      kind: "missing_profile",
      severity: "warning",
      messageKey: "databaseConsistency.issues.instanceRoleMissing",
      resourceId: resource.id,
      resourceName: resource.displayName,
    });
  }

  if (!hostname || port == null) {
    issues.push({
      id: "instance-connection-missing",
      kind: "missing_profile",
      severity: "warning",
      messageKey: "databaseConsistency.issues.instanceConnectionMissing",
      resourceId: resource.id,
      resourceName: resource.displayName,
    });
  }

  if (topology) {
    const appearsInTopology = topology.nodes.some(
      (node) => Number(node.id) === resource.id,
    );
    if (!appearsInTopology) {
      issues.push({
        id: "instance-missing-from-topology",
        kind: "topology_mismatch",
        severity: "warning",
        messageKey: "databaseConsistency.issues.instanceMissingFromTopology",
        resourceId: resource.id,
        resourceName: resource.displayName,
      });
    }
  }

  return {
    status: toStatus(issues),
    facts: {
      parentClusterId: resource.clusterInfo?.id,
      parentClusterName: resource.clusterInfo?.displayName,
      role,
      connection: hostname && port != null ? `${hostname}:${port}` : undefined,
    },
    issues,
  };
}
