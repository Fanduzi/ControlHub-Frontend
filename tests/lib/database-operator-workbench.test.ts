import { describe, expect, it } from "vitest";

import {
  buildClusterMemberSummary,
  buildDatabaseOperatorVerdict,
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
