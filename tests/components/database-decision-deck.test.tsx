import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ClusterMember } from "@/types/resource";
import type { ResourceDetailViewModel } from "@/types/view-models";

const deckKeys: Record<string, string> = {
  "title": "Decision deck",
  "description":
    "Verdict, top evidence, next checks, topology, and abnormal members.",
  "topEvidence": "Top evidence",
  "nextChecks": "Next checks",
  "topologyTitle": "Topology analysis",
  "topologyDescription":
    "Open expanded topology to inspect upstream and downstream context.",
  "openTopology": "Open topology",
  "abnormalMembers": "Abnormal members",
  "noAbnormalMembers": "No abnormal members.",
  "compact.membersNormal": "2 members normal",
  "compact.noRecentChanges": "No recent related changes",
  "compact.recentAudits": "3 recent audit events",
  "compact.parentClusterNormal": "Parent cluster normal",
  "memberRoleUnavailable": "Role not available",
  "viewMemberTopology": "View topology",
};

const operatorKeys: Record<string, string> = {
  "verdict.healthy": "Healthy",
  "verdict.needs_attention": "Needs attention",
  "verdict.critical": "Critical",
  "verdict.unknown": "Unknown",
  "facts.all_known_members_healthy": "All known members are healthy.",
  "facts.members_warning_or_critical":
    "Some members have warning or critical health.",
  "facts.resource_health_critical": "Resource health is critical.",
  "facts.lifecycle_needs_attention":
    "Some resources are stopped or degraded.",
  "facts.resource_health_unknown": "Resource health is unknown.",
  "evidence.resourceHealthCritical": "Resource health is critical.",
  "evidence.memberHealthAbnormal":
    "Members with warning or critical health: 1.",
  "evidence.memberLifecycleAbnormal": "Members stopped or degraded: 1.",
  "evidence.sources.resourceStatus": "Resource status",
  "evidence.sources.memberHealth": "Member health",
  "evidence.sources.memberLifecycle": "Member lifecycle",
  "evidence.rawHint": "Field",
  "evidence.empty":
    "No abnormal diagnostic evidence is available.",
  "runbook.checks.criticalHealth":
    "Check instance process status, connection details, and recent resource changes.",
  "runbook.checks.lifecycleState":
    "Confirm whether stopped or degraded state is expected maintenance or a recent change.",
  "runbook.checks.noFindings":
    "No clear abnormal signal is available. Continue with topology and audit history.",
};

const diagnosticsKeys: Record<string, string> = {
  "topology.viewTopology": "View topology",
  "missing.role": "Role not available",
};

const allKeys: Record<string, string> = {
  ...deckKeys,
  ...operatorKeys,
  ...diagnosticsKeys,
};

function t(key: string, params?: Record<string, number>) {
  let result = allKeys[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      result = result.replace(`{${name}}`, String(value));
    }
  }
  return result;
}

(t as unknown as { has: (key: string) => boolean }).has = () => true;

vi.mock("next-intl", () => ({
  useTranslations: () => t,
}));

function resource(
  overrides: Partial<ResourceDetailViewModel> = {},
): ResourceDetailViewModel {
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
    relations: [],
    auditEvents: [],
    recentAudits: [],
    members: [],
    ...overrides,
  };
}

function member(overrides: Partial<ClusterMember> = {}): ClusterMember {
  return {
    id: 22,
    name: "payment-mysql-replica-prod",
    displayName: "Payment MySQL Replica Production",
    resourceType: "database_instance",
    resourceSubtype: "mysql",
    lifecycleStatus: "running",
    healthStatus: "healthy",
    profileSummary: {
      role: "replica",
      hostname: "prod-db-host-04.internal",
      port: 3307,
    },
    ...overrides,
  };
}

describe("DatabaseDecisionDeck", () => {
  describe("diagnostic mode (abnormal resources)", () => {
    it("shows verdict, top evidence, next checks, and topology entry for critical resource", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource({ healthStatus: "critical" })}
          members={[]}
          recentAudits={[]}
        />,
      );

      expect(screen.getByText("Decision deck")).toBeInTheDocument();
      expect(screen.getByText("Critical")).toBeInTheDocument();
      expect(screen.getByText("Top evidence")).toBeInTheDocument();
      expect(screen.getByText("Next checks")).toBeInTheDocument();
      expect(screen.getByText("Topology analysis")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open topology" })).toHaveAttribute(
        "href",
        "/resources/14?topologyDepth=2&topologyExpanded=1",
      );
    });

    it("limits first-screen evidence and checks to three items", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource({ healthStatus: "critical" })}
          members={[
            member({ healthStatus: "critical" }),
            member({ lifecycleStatus: "stopped" }),
          ]}
          recentAudits={[]}
        />,
      );

      expect(screen.getAllByTestId("decision-evidence-item")).toHaveLength(3);
      expect(
        screen.getAllByTestId("decision-runbook-item").length,
      ).toBeLessThanOrEqual(3);
    });

    it("shows abnormal members for clusters and hides healthy members from shortcut", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource({ healthStatus: "warning" })}
          members={[
            member({ id: 22, displayName: "Healthy Replica" }),
            member({
              id: 23,
              displayName: "Critical Replica",
              healthStatus: "critical",
            }),
          ]}
          recentAudits={[]}
        />,
      );

      expect(screen.getByText("Abnormal members")).toBeInTheDocument();
      expect(screen.getByText("Critical Replica")).toBeInTheDocument();
      expect(screen.queryByText("Healthy Replica")).not.toBeInTheDocument();
    });

    it("does not show abnormal members section for instances", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource({ resourceType: "database_instance", healthStatus: "critical" })}
          members={[
            member({ id: 22, healthStatus: "critical", displayName: "Bad Instance" }),
          ]}
          recentAudits={[]}
        />,
      );

      expect(screen.queryByText("Abnormal members")).not.toBeInTheDocument();
      expect(screen.queryByText("Bad Instance")).not.toBeInTheDocument();
    });
  });

  describe("compact mode (healthy resources)", () => {
    it("renders compact health deck for healthy cluster with no abnormal members", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource()}
          members={[
            member({ id: 22, displayName: "Healthy Replica" }),
            member({ id: 23, displayName: "Another Healthy Replica" }),
          ]}
          recentAudits={[]}
        />,
      );

      expect(screen.getByTestId("database-compact-health-deck")).toBeInTheDocument();
      expect(screen.getByText("Healthy")).toBeInTheDocument();
      expect(screen.getByText("2 members normal")).toBeInTheDocument();
      expect(screen.getByText("No recent related changes")).toBeInTheDocument();
    });

    it("does not render Top evidence or Next checks in compact mode", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource()}
          members={[member({ id: 22 })]}
          recentAudits={[]}
        />,
      );

      expect(screen.queryByText("Top evidence")).not.toBeInTheDocument();
      expect(screen.queryByText("Next checks")).not.toBeInTheDocument();
      expect(screen.queryByText("Abnormal members")).not.toBeInTheDocument();
    });

    it("does not render topology link in compact healthy mode", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource()}
          members={[member({ id: 22 })]}
          recentAudits={[]}
        />,
      );

      expect(
        screen.queryByRole("link", { name: "View topology" }),
      ).not.toBeInTheDocument();
    });

    it("renders compact deck with recent audit count", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource()}
          members={[member({ id: 22 })]}
          recentAudits={[
            {
              id: 1,
              actorUserId: 1,
              targetResourceId: 14,
              eventType: "auth.logout",
              result: "success",
              createdAt: "2026-04-28T12:00:00Z",
              actorLabel: "admin",
              targetResourceName: "Test",
              environmentLabel: "Prod",
              summary: "Logout.",
            },
            {
              id: 2,
              actorUserId: 1,
              targetResourceId: 14,
              eventType: "auth.login",
              result: "success",
              createdAt: "2026-04-28T12:01:00Z",
              actorLabel: "admin",
              targetResourceName: "Test",
              environmentLabel: "Prod",
              summary: "Login 2.",
            },
            {
              id: 3,
              actorUserId: 1,
              targetResourceId: 14,
              eventType: "auth.login",
              result: "success",
              createdAt: "2026-04-28T12:02:00Z",
              actorLabel: "admin",
              targetResourceName: "Test",
              environmentLabel: "Prod",
              summary: "Login 3.",
            },
          ]}
        />,
      );

      expect(screen.getByText("3 recent audit events")).toBeInTheDocument();
      expect(screen.queryByText("No recent related changes")).not.toBeInTheDocument();
    });

    it("renders compact deck for healthy instance with role, connection, and parent cluster", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      const instanceResource: ResourceDetailViewModel = {
        ...resource(),
        resourceType: "database_instance",
        profileSummary: {
          role: "primary",
          hostname: "db-01.internal",
          port: 3306,
        },
        clusterInfo: {
          id: 14,
          displayName: "Orders Cluster",
          healthStatus: "healthy",
          lifecycleStatus: "running",
        },
      };

      render(
        <DatabaseDecisionDeck
          resource={instanceResource}
          members={[]}
          recentAudits={[]}
        />,
      );

      expect(screen.getByTestId("database-compact-health-deck")).toBeInTheDocument();
      expect(screen.getByText("primary")).toBeInTheDocument();
      expect(screen.getByText("db-01.internal:3306")).toBeInTheDocument();
      expect(screen.getByText("Parent cluster normal")).toBeInTheDocument();
    });
  });

  describe("audit-only evidence does not trigger diagnostic", () => {
    it("stays compact for healthy cluster with resource/relation audit events", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource()}
          members={[member({ id: 22 }), member({ id: 23 })]}
          recentAudits={[
            {
              id: 1,
              actorUserId: 1,
              targetResourceId: 14,
              eventType: "resource.updated",
              result: "success",
              createdAt: "2026-04-28T12:00:00Z",
              actorLabel: "admin",
              targetResourceName: "Test",
              environmentLabel: "Prod",
              summary: "Update.",
            },
            {
              id: 2,
              actorUserId: 1,
              targetResourceId: 14,
              eventType: "relation.created",
              result: "success",
              createdAt: "2026-04-28T12:01:00Z",
              actorLabel: "admin",
              targetResourceName: "Test",
              environmentLabel: "Prod",
              summary: "Created.",
            },
          ]}
        />,
      );

      expect(screen.getByTestId("database-compact-health-deck")).toBeInTheDocument();
      expect(screen.queryByText("Top evidence")).not.toBeInTheDocument();
      expect(screen.queryByText("Next checks")).not.toBeInTheDocument();
    });

    it("enters diagnostic when member is missing role information", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource()}
          members={[
            member({
              id: 22,
              profileSummary: { hostname: "db-01", port: 3306 },
            }),
          ]}
          recentAudits={[]}
        />,
      );

      expect(screen.queryByTestId("database-compact-health-deck")).not.toBeInTheDocument();
      expect(screen.getByText("Top evidence")).toBeInTheDocument();
    });
  });

  describe("abnormal members i18n", () => {
    it("uses translated strings for missing role and member topology link", async () => {
      const { DatabaseDecisionDeck } = await import(
        "@/components/resources/database-decision-deck"
      );

      render(
        <DatabaseDecisionDeck
          resource={resource({ healthStatus: "warning" })}
          members={[
            member({
              id: 23,
              displayName: "No Role Member",
              healthStatus: "warning",
              profileSummary: { hostname: "db-01", port: 3306 },
            }),
          ]}
          recentAudits={[]}
        />,
      );

      expect(screen.getByText("Role not available")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "View topology" }),
      ).toHaveAttribute("href", "/resources/23?topologyDepth=2&topologyExpanded=1");
    });
  });
});
