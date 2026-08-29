// input: database detail view-model fixtures, topology records, and consistency builders
// output: database parent, member, profile, and topology consistency contracts
// pos: public consistency-helper seam for database detail consumers
// note: if this file changes, update this header and tests/lib/README.md.
import { describe, expect, it } from "vitest";

import type { ClusterMember, TopologyResponse } from "@/types/resource";
import type { ResourceDetailViewModel } from "@/types/view-models";
import {
  buildClusterConsistency,
  buildInstanceConsistency,
} from "@/lib/database-read-model-consistency";

function clusterResource(): ResourceDetailViewModel {
  return {
    id: 14,
    resourceType: "database_cluster",
    resourceSubtype: "mysql",
    name: "payment-mysql-cluster-prod",
    displayName: "Payment MySQL Cluster Production",
    environmentId: 1,
    ownerId: 1,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "seed",
    externalId: "dbaas-payment-mysql-cluster-prod",
    labels: {},
    createdAt: "",
    updatedAt: "",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    environmentName: "Production",
    ownerName: "DBA Team",
    summary: "",
    isArchived: false,
    profile: {},
    profileSummary: { engine: "mysql", nodeCount: 2 },
    relations: [
      {
        id: 1,
        fromResourceId: 22,
        toResourceId: 14,
        relationType: "member_of",
        createdAt: "",
        direction: "incoming",
        relatedResourceId: 22,
        relatedResourceName: "payment-mysql-primary-prod",
      },
    ],
    auditEvents: [],
    recentAudits: [],
    members: [],
  };
}

function instanceResource(): ResourceDetailViewModel {
  return {
    ...clusterResource(),
    id: 22,
    resourceType: "database_instance",
    name: "payment-mysql-primary-prod",
    displayName: "Payment MySQL Primary Production",
    profileSummary: {
      engine: "mysql",
      version: "8.0.36",
      hostname: "prod-db-host-02.internal",
      port: 3307,
      role: "primary",
    },
    clusterInfo: {
      id: 14,
      displayName: "Payment MySQL Cluster Production",
      healthStatus: "healthy",
      lifecycleStatus: "running",
    },
    relations: [
      {
        id: 1,
        fromResourceId: 22,
        toResourceId: 14,
        relationType: "member_of",
        createdAt: "",
        direction: "outgoing",
        relatedResourceId: 14,
        relatedResourceName: "payment-mysql-cluster-prod",
      },
    ],
    members: undefined,
  };
}

function member(overrides: Partial<ClusterMember> = {}): ClusterMember {
  return {
    id: 22,
    name: "payment-mysql-primary-prod",
    displayName: "Payment MySQL Primary Production",
    resourceType: "database_instance",
    resourceSubtype: "mysql",
    lifecycleStatus: "running",
    healthStatus: "healthy",
    profileSummary: {
      role: "primary",
      hostname: "prod-db-host-02.internal",
      port: 3307,
      engine: "mysql",
    },
    ...overrides,
  };
}

function topologyNode(id: number, resourceType: string) {
  return {
    id,
    resourceType,
    resourceSubtype: "mysql",
    name: `node-${id}`,
    displayName: `Node ${id}`,
    environmentId: 1,
    ownerId: 1,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    isRoot: id === 14,
    distance: id === 14 ? 0 : 1,
    topologyRole: id === 14 ? ("cluster" as const) : ("replica" as const),
    topologyLayer: id === 14 ? ("cluster" as const) : ("replication" as const),
    groupKey: id === 14 ? "cluster" : "replication",
    visualImportance: 5,
    isDatabaseTopology: true,
    replicationDepth: 0,
  };
}

function topology(resourceIds: number[]): TopologyResponse {
  return {
    rootResourceId: 14,
    depth: 2,
    direction: "both",
    nodes: resourceIds.map((id) =>
      topologyNode(id, id === 14 ? "database_cluster" : "database_instance"),
    ),
    edges: [],
    groups: [],
    isDatabaseTopology: true,
  };
}

describe("database read-model consistency", () => {
  describe("buildClusterConsistency", () => {
    it("returns ok for a cluster whose members, relations, and topology agree", () => {
      const result = buildClusterConsistency({
        resource: clusterResource(),
        members: [member()],
        topology: topology([14, 22]),
      });

      expect(result.status).toBe("ok");
      expect(result.issues).toHaveLength(0);
      expect(result.counts.members).toBe(1);
      expect(result.counts.topologyDatabaseNodes).toBe(1);
    });

    it("reports missing member role", () => {
      const result = buildClusterConsistency({
        resource: clusterResource(),
        members: [member({ profileSummary: { hostname: "db", port: 3306 } })],
        topology: topology([14, 22]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "member-role-missing-22",
          kind: "missing_profile",
          messageKey: "databaseConsistency.issues.memberRoleMissing",
        }),
      );
    });

    it("reports member missing connection", () => {
      const result = buildClusterConsistency({
        resource: clusterResource(),
        members: [member({ profileSummary: { role: "replica", engine: "mysql" } })],
        topology: topology([14, 22]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "member-connection-missing-22",
          kind: "missing_profile",
          messageKey: "databaseConsistency.issues.memberConnectionMissing",
        }),
      );
    });

    it("reports member missing from topology", () => {
      const result = buildClusterConsistency({
        resource: clusterResource(),
        members: [member()],
        topology: topology([14]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "member-missing-from-topology-22",
          kind: "topology_mismatch",
        }),
      );
    });

    it("reports topology-only database instance node", () => {
      const result = buildClusterConsistency({
        resource: clusterResource(),
        members: [member()],
        topology: topology([14, 22, 23]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "topology-only-node-23",
          kind: "topology_mismatch",
        }),
      );
    });

    it("reports missing member_of relation", () => {
      const resource = clusterResource();
      // Replace member_of with a different relation type so member 22 has no member_of
      resource.relations = [
        {
          id: 2,
          fromResourceId: 22,
          toResourceId: 99,
          relationType: "depends_on",
          createdAt: "",
          direction: "outgoing",
          relatedResourceId: 99,
          relatedResourceName: "other-resource",
        },
      ];

      const result = buildClusterConsistency({
        resource,
        members: [member()],
        topology: topology([14, 22]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "member-relation-missing-22",
          kind: "missing_relation",
          messageKey: "databaseConsistency.issues.memberRelationMissing",
        }),
      );
    });

    it("does not report relation missing when no relations data available", () => {
      const resource = clusterResource();
      resource.relations = [];

      const result = buildClusterConsistency({
        resource,
        members: [member()],
        topology: topology([14, 22]),
      });

      // Empty relations means hasRelations=false, so relation check is skipped
      const relationIssues = result.issues.filter(
        (i) => i.kind === "missing_relation",
      );
      expect(relationIssues).toHaveLength(0);
    });

    it("reports relation missing when relations exist but member has none", () => {
      const resource = clusterResource();
      // Has a relation, but for a different member (id=99), not member 22
      resource.relations = [
        {
          id: 99,
          fromResourceId: 99,
          toResourceId: 14,
          relationType: "member_of",
          createdAt: "",
          direction: "incoming",
          relatedResourceId: 99,
          relatedResourceName: "other-instance",
        },
      ];

      const result = buildClusterConsistency({
        resource,
        members: [member()],
        topology: topology([14, 22]),
      });

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "member-relation-missing-22",
          kind: "missing_relation",
        }),
      );
    });

    it("recognizes bare relation fields fromResourceId + toResourceId", () => {
      const resource = clusterResource();
      resource.relations = [
        {
          id: 99,
          fromResourceId: 22,
          toResourceId: 14,
          relationType: "member_of",
          createdAt: "",
          direction: "outgoing",
          relatedResourceId: 14,
          relatedResourceName: "cluster",
        },
      ];

      const result = buildClusterConsistency({
        resource,
        members: [member()],
        topology: topology([14, 22]),
      });

      const relationIssues = result.issues.filter(
        (i) => i.kind === "missing_relation",
      );
      expect(relationIssues).toHaveLength(0);
    });
  });

  describe("buildInstanceConsistency", () => {
    it("returns ok for an instance with parent cluster, role, connection, and topology", () => {
      const result = buildInstanceConsistency({
        resource: instanceResource(),
        topology: topology([14, 22]),
      });

      expect(result.status).toBe("ok");
      expect(result.issues).toHaveLength(0);
      expect(result.facts.role).toBe("primary");
      expect(result.facts.connection).toBe("prod-db-host-02.internal:3307");
    });

    it("reports missing instance role", () => {
      const resource = instanceResource();
      resource.profileSummary = { hostname: "db", port: 3306, engine: "mysql" };

      const result = buildInstanceConsistency({
        resource,
        topology: topology([14, 22]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "instance-role-missing",
          kind: "missing_profile",
        }),
      );
    });

    it("reports missing instance parent cluster", () => {
      const resource = instanceResource();
      resource.clusterInfo = undefined;

      const result = buildInstanceConsistency({
        resource,
        topology: topology([14, 22]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "instance-parent-cluster-missing",
          kind: "missing_relation",
        }),
      );
    });

    it("does not report a missing parent when the detail view model resolved one from its relation", () => {
      const result = buildInstanceConsistency({
        resource: instanceResource(),
        topology: topology([14, 22]),
      });

      expect(result.issues).not.toContainEqual(
        expect.objectContaining({ id: "instance-parent-cluster-missing" }),
      );
    });

    it("reports missing instance connection", () => {
      const resource = instanceResource();
      resource.profileSummary = { role: "replica", engine: "mysql" };

      const result = buildInstanceConsistency({
        resource,
        topology: topology([14, 22]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "instance-connection-missing",
          kind: "missing_profile",
        }),
      );
    });

    it("reports instance missing from topology", () => {
      const result = buildInstanceConsistency({
        resource: instanceResource(),
        topology: topology([14]),
      });

      expect(result.status).toBe("warning");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          id: "instance-missing-from-topology",
          kind: "topology_mismatch",
        }),
      );
    });

    it("includes parent cluster id in instance consistency facts", () => {
      const result = buildInstanceConsistency({
        resource: instanceResource(),
        topology: topology([14, 22]),
      });

      expect(result.facts.parentClusterId).toBe(14);
      expect(result.facts.parentClusterName).toBe("Payment MySQL Cluster Production");
    });
  });
});
