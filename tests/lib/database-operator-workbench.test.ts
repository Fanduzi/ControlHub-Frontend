import { describe, expect, it } from "vitest";

import {
  buildClusterMemberSummary,
  buildDatabaseOperatorVerdict,
  sortClusterMembersForOperations,
} from "@/lib/database-operator-workbench";
import type { ResourceListViewModel } from "@/types/view-models";
import type { ClusterMember } from "@/types/resource";

function resource(
  overrides: Partial<ResourceListViewModel>,
): ResourceListViewModel {
  return {
    id: 1,
    name: "db",
    displayName: "DB",
    resourceType: "database_cluster",
    resourceSubtype: "mysql",
    environmentId: 1,
    ownerId: 1,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "",
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
    ...overrides,
  };
}

function member(overrides: Partial<ClusterMember>): ClusterMember {
  return {
    id: 10,
    name: "mysql-1",
    displayName: "MySQL 1",
    resourceType: "database_instance",
    resourceSubtype: "mysql",
    lifecycleStatus: "running",
    healthStatus: "healthy",
    profileSummary: { role: "replica", hostname: "db-1", port: 3306 },
    ...overrides,
  };
}

describe("buildClusterMemberSummary", () => {
  it("counts total, primary, replica, warning/critical, and stopped/degraded members", () => {
    const summary = buildClusterMemberSummary([
      member({
        profileSummary: { role: "primary", hostname: "db-1", port: 3306 },
      }),
      member({ healthStatus: "warning", profileSummary: { role: "replica" } }),
      member({
        healthStatus: "critical",
        lifecycleStatus: "stopped",
        profileSummary: { role: "replica" },
      }),
      member({ profileSummary: {} }),
    ]);

    expect(summary).toEqual({
      total: 4,
      primary: 1,
      replica: 2,
      roleUnknown: 1,
      warningOrCritical: 2,
      stoppedOrDegraded: 1,
    });
  });

  it("returns zero counts for empty members", () => {
    const summary = buildClusterMemberSummary([]);

    expect(summary).toEqual({
      total: 0,
      primary: 0,
      replica: 0,
      roleUnknown: 0,
      warningOrCritical: 0,
      stoppedOrDegraded: 0,
    });
  });

  it("recognizes master/secondary/writer/reader role aliases", () => {
    const summary = buildClusterMemberSummary([
      member({ profileSummary: { role: "master" } }),
      member({ profileSummary: { role: "secondary" } }),
      member({ profileSummary: { role: "writer" } }),
      member({ profileSummary: { role: "reader" } }),
    ]);

    expect(summary.primary).toBe(2);
    expect(summary.replica).toBe(2);
    expect(summary.roleUnknown).toBe(0);
  });
});

describe("buildDatabaseOperatorVerdict", () => {
  it("returns critical when the resource itself is critical", () => {
    const verdict = buildDatabaseOperatorVerdict({
      resource: resource({ healthStatus: "critical" }),
      members: [],
    });

    expect(verdict.level).toBe("critical");
    expect(verdict.facts).toContain("resource_health_critical");
  });

  it("returns needs_attention when any member is warning or critical", () => {
    const verdict = buildDatabaseOperatorVerdict({
      resource: resource({ healthStatus: "healthy" }),
      members: [member({ healthStatus: "warning" })],
    });

    expect(verdict.level).toBe("needs_attention");
    expect(verdict.facts).toContain("members_warning_or_critical");
  });

  it("returns needs_attention when resource lifecycle is stopped or degraded", () => {
    const verdict = buildDatabaseOperatorVerdict({
      resource: resource({ healthStatus: "healthy", lifecycleStatus: "degraded" }),
      members: [],
    });

    expect(verdict.level).toBe("needs_attention");
    expect(verdict.facts).toContain("lifecycle_needs_attention");
  });

  it("returns healthy when resource and known members are healthy and running", () => {
    const verdict = buildDatabaseOperatorVerdict({
      resource: resource({ healthStatus: "healthy", lifecycleStatus: "running" }),
      members: [
        member({ healthStatus: "healthy", lifecycleStatus: "running" }),
      ],
    });

    expect(verdict.level).toBe("healthy");
    expect(verdict.facts).toContain("all_known_members_healthy");
  });

  it("returns unknown when resource health is unknown and no warning signals", () => {
    const verdict = buildDatabaseOperatorVerdict({
      resource: resource({ healthStatus: "unknown", lifecycleStatus: "running" }),
      members: [],
    });

    expect(verdict.level).toBe("unknown");
    expect(verdict.facts).toContain("resource_health_unknown");
  });

  it("returns needs_attention when any member is stopped or degraded", () => {
    const verdict = buildDatabaseOperatorVerdict({
      resource: resource({ healthStatus: "healthy", lifecycleStatus: "running" }),
      members: [member({ lifecycleStatus: "stopped" })],
    });

    expect(verdict.level).toBe("needs_attention");
    expect(verdict.facts).toContain("lifecycle_needs_attention");
  });
});

describe("sortClusterMembersForOperations", () => {
  it("sorts critical primary before warning replica and healthy replica", () => {
    const sorted = sortClusterMembersForOperations([
      member({ id: 3, displayName: "healthy replica", healthStatus: "healthy", lifecycleStatus: "running", profileSummary: { role: "replica" } }),
      member({ id: 2, displayName: "warning replica", healthStatus: "warning", lifecycleStatus: "running", profileSummary: { role: "replica" } }),
      member({ id: 1, displayName: "critical primary", healthStatus: "critical", lifecycleStatus: "running", profileSummary: { role: "primary" } }),
    ]);

    expect(sorted.map((m) => m.displayName)).toEqual([
      "critical primary",
      "warning replica",
      "healthy replica",
    ]);
  });

  it("sorts stopped members before healthy running members", () => {
    const sorted = sortClusterMembersForOperations([
      member({ id: 1, displayName: "healthy", healthStatus: "healthy", lifecycleStatus: "running" }),
      member({ id: 2, displayName: "stopped", healthStatus: "healthy", lifecycleStatus: "stopped" }),
    ]);

    expect(sorted[0].displayName).toBe("stopped");
  });

  it("sorts primary before replica when severity is equal", () => {
    const sorted = sortClusterMembersForOperations([
      member({ id: 1, displayName: "replica", healthStatus: "healthy", lifecycleStatus: "running", profileSummary: { role: "replica" } }),
      member({ id: 2, displayName: "primary", healthStatus: "healthy", lifecycleStatus: "running", profileSummary: { role: "primary" } }),
    ]);

    expect(sorted[0].displayName).toBe("primary");
  });

  it("sorts unknown role after known primary and replica", () => {
    const sorted = sortClusterMembersForOperations([
      member({ id: 1, displayName: "unknown-role", healthStatus: "healthy", lifecycleStatus: "running", profileSummary: {} }),
      member({ id: 2, displayName: "primary", healthStatus: "healthy", lifecycleStatus: "running", profileSummary: { role: "primary" } }),
      member({ id: 3, displayName: "replica", healthStatus: "healthy", lifecycleStatus: "running", profileSummary: { role: "replica" } }),
    ]);

    expect(sorted.map((m) => m.displayName)).toEqual([
      "primary",
      "replica",
      "unknown-role",
    ]);
  });

  it("uses display name as tie-breaker", () => {
    const sorted = sortClusterMembersForOperations([
      member({ id: 1, displayName: "z-node", healthStatus: "healthy", lifecycleStatus: "running" }),
      member({ id: 2, displayName: "a-node", healthStatus: "healthy", lifecycleStatus: "running" }),
    ]);

    expect(sorted.map((m) => m.displayName)).toEqual(["a-node", "z-node"]);
  });

  it("does not mutate the input array", () => {
    const original = [
      member({ id: 1, displayName: "B" }),
      member({ id: 2, displayName: "A" }),
    ];
    const originalOrder = original.map((m) => m.id);
    sortClusterMembersForOperations(original);
    expect(original.map((m) => m.id)).toEqual(originalOrder);
  });
});
