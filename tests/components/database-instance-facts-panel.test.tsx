import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { InstanceConsistencyResult } from "@/lib/database-read-model-consistency";

function t(key: string) {
  const keys: Record<string, string> = {
    "instanceFacts.title": "Instance context and consistency",
    "instanceFacts.description":
      "Parent cluster, role, connection, topology, and data consistency.",
    "instanceFacts.parentCluster": "Parent cluster",
    "instanceFacts.role": "Role",
    "instanceFacts.connection": "Connection",
    "instanceFacts.topology": "Topology",
    "instanceFacts.topologyPresent": "Instance appears in topology",
    "instanceFacts.missing": "Not provided by backend",
    "status.ok": "Data consistent",
    "status.warning": "Needs data review",
    "status.unknown": "Not enough data",
    "issues.instanceRoleMissing":
      "Backend did not provide instance role information.",
    "issues.instanceConnectionMissing":
      "Backend did not provide instance host or port information.",
  };
  return keys[key] ?? key;
}

vi.mock("next-intl", () => ({
  useTranslations: () => t,
}));

describe("DatabaseInstanceFactsPanel", () => {
  it("renders merged parent, role, connection, topology, and status facts", async () => {
    const { DatabaseInstanceFactsPanel } = await import(
      "@/components/resources/database-instance-facts-panel"
    );

    const result: InstanceConsistencyResult = {
      status: "ok",
      facts: {
        parentClusterName: "Payment MySQL Cluster Production",
        role: "replica",
        connection: "prod-db-host-02.internal:3307",
      },
      issues: [],
    };

    render(<DatabaseInstanceFactsPanel result={result} />);

    expect(
      screen.getByText("Instance context and consistency"),
    ).toBeInTheDocument();
    expect(screen.getByText("Data consistent")).toBeInTheDocument();
    expect(
      screen.getByText("Payment MySQL Cluster Production"),
    ).toBeInTheDocument();
    expect(screen.getByText("replica")).toBeInTheDocument();
    expect(
      screen.getByText("prod-db-host-02.internal:3307"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Instance appears in topology"),
    ).toBeInTheDocument();
  });

  it("renders explicit missing value copy and warning issues", async () => {
    const { DatabaseInstanceFactsPanel } = await import(
      "@/components/resources/database-instance-facts-panel"
    );

    const result: InstanceConsistencyResult = {
      status: "warning",
      facts: {
        parentClusterName: "Payment MySQL Cluster Production",
      },
      issues: [
        {
          id: "instance-role-missing",
          kind: "missing_profile",
          severity: "warning",
          messageKey: "databaseConsistency.issues.instanceRoleMissing",
          resourceName: "Payment MySQL Replica",
        },
      ],
    };

    render(<DatabaseInstanceFactsPanel result={result} />);

    expect(screen.getByText("Needs data review")).toBeInTheDocument();
    expect(screen.getAllByText("Not provided by backend").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Backend did not provide instance role information.",
      ),
    ).toBeInTheDocument();
  });

  it("shows missing topology when instance-missing-from-topology issue exists", async () => {
    const { DatabaseInstanceFactsPanel } = await import(
      "@/components/resources/database-instance-facts-panel"
    );

    const result: InstanceConsistencyResult = {
      status: "warning",
      facts: {
        parentClusterName: "Cluster A",
        role: "primary",
        connection: "db-01:3306",
      },
      issues: [
        {
          id: "instance-missing-from-topology",
          kind: "topology_mismatch",
          severity: "warning",
          messageKey: "databaseConsistency.issues.instanceMissingFromTopology",
          resourceName: "DB Instance",
        },
      ],
    };

    render(<DatabaseInstanceFactsPanel result={result} />);

    expect(screen.getByText("Cluster A")).toBeInTheDocument();
    expect(screen.getByText("primary")).toBeInTheDocument();
    expect(screen.getByText("db-01:3306")).toBeInTheDocument();
    expect(screen.queryByText("Instance appears in topology")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not provided by backend").length).toBeGreaterThan(0);
  });
});
