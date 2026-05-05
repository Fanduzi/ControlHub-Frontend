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
  it("marks healthy cluster with no abnormal members as healthy", () => {
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
    expect(signal.reason).toBe("no_abnormal_members");
  });

  it("marks cluster with one critical member as needs_attention", () => {
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
    expect(signal.reason).toBe("critical_member");
    expect(signal.memberSignal).toBe("critical");
    expect(signal.memberCount).toBe(1);
    expect(signal.worstMemberName).toBe("Analytics ClickHouse Node 02");
  });

  it("marks cluster with warning members as needs_attention", () => {
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
    expect(signal.reason).toBe("warning_member");
    expect(signal.memberSignal).toBe("warning");
    expect(signal.memberCount).toBe(2);
  });

  it("marks cluster with stopped members as needs_attention", () => {
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
    expect(signal.reason).toBe("member_lifecycle");
    expect(signal.memberSignal).toBe("lifecycle");
    expect(signal.memberCount).toBe(1);
  });

  it("marks cluster with degraded members as needs_attention", () => {
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
    expect(signal.reason).toBe("member_lifecycle");
    expect(signal.memberCount).toBe(2);
  });

  it("returns unknown when cluster has no summary", () => {
    const signal = buildDatabaseOperationalSignal(cluster());

    expect(signal.level).toBe("unknown");
    expect(signal.reason).toBe("unknown");
  });

  it("marks critical instance from its own health status", () => {
    const signal = buildDatabaseOperationalSignal(
      instance({
        healthStatus: "critical",
        displayName: "Analytics ClickHouse Node 02",
      }),
    );

    expect(signal.level).toBe("critical");
    expect(signal.reason).toBe("resource_status");
  });

  it("marks warning instance as needs_attention", () => {
    const signal = buildDatabaseOperationalSignal(
      instance({ healthStatus: "warning" }),
    );

    expect(signal.level).toBe("needs_attention");
    expect(signal.reason).toBe("resource_status");
  });

  it("marks healthy instance with host/port metadata as unknown level", () => {
    const signal = buildDatabaseOperationalSignal(instance());

    expect(signal.level).toBe("unknown");
    expect(signal.reason).toBe("unknown");
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

    expect(signal.reason).toBe("critical_member");
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
    expect(signal.reason).toBe("resource_status");
  });
});
