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
  it("shows verdict, top evidence, next checks, and topology entry", async () => {
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
        resource={resource()}
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
    expect(
      screen.getByRole("link", { name: "View topology" }),
    ).toHaveAttribute(
      "href",
      "/resources/23?topologyDepth=2&topologyExpanded=1",
    );
  });

  it("does not show abnormal members section for instances", async () => {
    const { DatabaseDecisionDeck } = await import(
      "@/components/resources/database-decision-deck"
    );

    render(
      <DatabaseDecisionDeck
        resource={resource({ resourceType: "database_instance" })}
        members={[
          member({ id: 22, healthStatus: "critical", displayName: "Bad Instance" }),
        ]}
        recentAudits={[]}
      />,
    );

    expect(screen.queryByText("Abnormal members")).not.toBeInTheDocument();
    expect(screen.queryByText("Bad Instance")).not.toBeInTheDocument();
  });

  it("shows no abnormal members message when all are healthy", async () => {
    const { DatabaseDecisionDeck } = await import(
      "@/components/resources/database-decision-deck"
    );

    render(
      <DatabaseDecisionDeck
        resource={resource()}
        members={[member({ id: 22, displayName: "Healthy Replica" })]}
        recentAudits={[]}
      />,
    );

    expect(screen.getByText("No abnormal members.")).toBeInTheDocument();
  });

  it("renders display name and environment in the identity area", async () => {
    const { DatabaseDecisionDeck } = await import(
      "@/components/resources/database-decision-deck"
    );

    render(
      <DatabaseDecisionDeck
        resource={resource()}
        members={[]}
        recentAudits={[]}
      />,
    );

    expect(
      screen.getByText("Payment MySQL Cluster Production"),
    ).toBeInTheDocument();
    expect(screen.getByText("mysql")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
  });
});
