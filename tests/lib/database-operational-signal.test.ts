import { describe, expect, it } from "vitest";
import { buildDatabaseOperationalSignal } from "@/lib/database-operational-signal";
import type { ResourceListViewModel } from "@/types/view-models";

function cluster(
  overrides: Partial<ResourceListViewModel> = {},
): ResourceListViewModel {
  return {
    id: 14,
    resourceType: "database_cluster",
    resourceSubtype: "clickhouse",
    name: "analytics-ch-cluster-prod",
    displayName: "Analytics ClickHouse Cluster Production",
    environmentId: 1,
    ownerId: 2,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "",
    labels: {},
    createdAt: "2026-04-14T06:56:00Z",
    updatedAt: "2026-04-14T06:56:00Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    environmentName: "Production",
    ownerName: "DBA Team",
    summary: "Cluster",
    isArchived: false,
    profileSummary: { nodeCount: 2, engine: "clickhouse" },
    ...overrides,
  };
}

function instance(
  overrides: Partial<ResourceListViewModel> = {},
): ResourceListViewModel {
  return {
    id: 22,
    resourceType: "database_instance",
    resourceSubtype: "clickhouse",
    name: "analytics-ch-node-01-prod",
    displayName: "Analytics ClickHouse Node 01 Production",
    environmentId: 1,
    ownerId: 2,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "",
    labels: {},
    createdAt: "2026-04-14T06:56:00Z",
    updatedAt: "2026-04-14T06:56:00Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    environmentName: "Production",
    ownerName: "DBA Team",
    summary: "Instance",
    isArchived: false,
    clusterId: 14,
    profileSummary: {
      hostname: "prod-ch-host-01.internal",
      port: 8123,
      engine: "clickhouse",
      version: "24.3",
      role: "replica",
    },
    ...overrides,
  };
}

describe("buildDatabaseOperationalSignal", () => {
  // ── Instance signals ──

  describe("database_instance", () => {
    it("healthy instance with no databaseOperationalSummary → healthy / instance_healthy", () => {
      const signal = buildDatabaseOperationalSignal(instance());
      expect(signal.level).toBe("healthy");
      expect(signal.reason).toBe("instance_healthy");
    });

    it("healthy instance with null databaseOperationalSummary → healthy / instance_healthy", () => {
      const signal = buildDatabaseOperationalSignal(
        instance({ databaseOperationalSummary: null }),
      );
      expect(signal.level).toBe("healthy");
      expect(signal.reason).toBe("instance_healthy");
    });

    it("critical instance with no summary → needs_attention / instance_resource_critical", () => {
      const signal = buildDatabaseOperationalSignal(
        instance({
          healthStatus: "critical",
          displayName: "Analytics ClickHouse Node 02",
        }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("instance_resource_critical");
    });

    it("warning instance → needs_attention / instance_resource_warning", () => {
      const signal = buildDatabaseOperationalSignal(
        instance({ healthStatus: "warning" }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("instance_resource_warning");
    });

    it("stopped instance → needs_attention / instance_lifecycle_stopped", () => {
      const signal = buildDatabaseOperationalSignal(
        instance({ lifecycleStatus: "stopped" }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("instance_lifecycle_stopped");
    });

    it("degraded instance → needs_attention / instance_lifecycle_degraded", () => {
      const signal = buildDatabaseOperationalSignal(
        instance({ lifecycleStatus: "degraded" }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("instance_lifecycle_degraded");
    });

    it("unknown health/lifecycle → unknown / instance_status_unknown", () => {
      const signal = buildDatabaseOperationalSignal(
        instance({
          healthStatus: "unknown" as ResourceListViewModel["healthStatus"],
          lifecycleStatus: "unknown" as ResourceListViewModel["lifecycleStatus"],
        }),
      );
      expect(signal.level).toBe("unknown");
      expect(signal.reason).toBe("instance_status_unknown");
    });

    it("prioritizes critical health over lifecycle status", () => {
      const signal = buildDatabaseOperationalSignal(
        instance({ healthStatus: "critical", lifecycleStatus: "stopped" }),
      );
      expect(signal.reason).toBe("instance_resource_critical");
    });

    it("prioritizes warning health over lifecycle status", () => {
      const signal = buildDatabaseOperationalSignal(
        instance({ healthStatus: "warning", lifecycleStatus: "degraded" }),
      );
      expect(signal.reason).toBe("instance_resource_warning");
    });
  });

  // ── Cluster signals ──

  describe("database_cluster", () => {
    it("healthy cluster with no abnormal members → healthy / cluster_healthy", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          databaseOperationalSummary: {
            memberCount: 3,
            criticalMemberCount: 0,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 2,
          },
        }),
      );
      expect(signal.level).toBe("healthy");
      expect(signal.reason).toBe("cluster_healthy");
    });

    it("cluster with one critical member → needs_attention / cluster_member_critical", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          databaseOperationalSummary: {
            memberCount: 2,
            criticalMemberCount: 1,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 0,
            replicaMemberCount: 2,
            worstMemberId: 23,
            worstMemberName: "Analytics ClickHouse Node 02",
            worstMemberStatus: "critical",
          },
        }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("cluster_member_critical");
      expect(signal.memberSignal).toBe("critical");
      expect(signal.memberCount).toBe(1);
      expect(signal.worstMemberName).toBe("Analytics ClickHouse Node 02");
    });

    it("cluster with warning members → needs_attention / cluster_member_warning", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          databaseOperationalSummary: {
            memberCount: 2,
            criticalMemberCount: 0,
            warningMemberCount: 2,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 1,
            worstMemberName: "Config Service MySQL Primary",
            worstMemberStatus: "warning",
          },
        }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("cluster_member_warning");
      expect(signal.memberSignal).toBe("warning");
      expect(signal.memberCount).toBe(2);
    });

    it("cluster with stopped members → needs_attention / cluster_member_lifecycle", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          databaseOperationalSummary: {
            memberCount: 3,
            criticalMemberCount: 0,
            warningMemberCount: 0,
            stoppedMemberCount: 1,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 2,
          },
        }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("cluster_member_lifecycle");
      expect(signal.memberSignal).toBe("lifecycle");
      expect(signal.memberCount).toBe(1);
    });

    it("cluster with degraded members → needs_attention / cluster_member_lifecycle", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          databaseOperationalSummary: {
            memberCount: 3,
            criticalMemberCount: 0,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 2,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 2,
          },
        }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("cluster_member_lifecycle");
      expect(signal.memberCount).toBe(2);
    });

    it("cluster with no summary → unknown / cluster_summary_unavailable", () => {
      const signal = buildDatabaseOperationalSignal(cluster());
      expect(signal.level).toBe("unknown");
      expect(signal.reason).toBe("cluster_summary_unavailable");
    });

    it("prioritizes critical member over warning member", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          databaseOperationalSummary: {
            memberCount: 3,
            criticalMemberCount: 1,
            warningMemberCount: 2,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 2,
            worstMemberName: "Critical Node",
            worstMemberStatus: "critical",
          },
        }),
      );
      expect(signal.reason).toBe("cluster_member_critical");
      expect(signal.memberCount).toBe(1);
    });

    it("prioritizes resource own critical status over member signals", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          healthStatus: "critical",
          databaseOperationalSummary: {
            memberCount: 2,
            criticalMemberCount: 1,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 0,
            replicaMemberCount: 2,
          },
        }),
      );
      expect(signal.level).toBe("critical");
      expect(signal.reason).toBe("instance_resource_critical");
    });

    it("cluster own warning status before member signals", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          healthStatus: "warning",
          databaseOperationalSummary: {
            memberCount: 2,
            criticalMemberCount: 1,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 0,
            replicaMemberCount: 2,
          },
        }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("instance_resource_warning");
    });

    it("cluster own stopped lifecycle before member signals", () => {
      const signal = buildDatabaseOperationalSignal(
        cluster({
          lifecycleStatus: "stopped",
          databaseOperationalSummary: {
            memberCount: 2,
            criticalMemberCount: 0,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 1,
          },
        }),
      );
      expect(signal.level).toBe("needs_attention");
      expect(signal.reason).toBe("instance_resource_warning");
    });
  });
});
