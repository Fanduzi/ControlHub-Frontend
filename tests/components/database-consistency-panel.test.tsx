import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  ClusterConsistencyResult,
  InstanceConsistencyResult,
} from "@/lib/database-read-model-consistency";

function t(key: string, params?: Record<string, number | string>) {
  const keys: Record<string, string> = {
    "title": "Page information check",
    "description": "Checks whether members, relations, topology, and profile information match.",
    "status.ok": "Information aligned",
    "status.warning": "Needs information review",
    "status.unknown": "Not enough information",
    "counts": "{members} members · {topologyDatabaseNodes} topology database instances",
    "allSignalsAgree": "Current page information is aligned.",
    "instanceSummary": "Instance profile, cluster link, and topology are consistent.",
    "issues.memberRoleMissing": "Backend did not provide role information.",
    "issues.memberMissingFromTopology": "Topology does not include this member.",
  };
  let result = keys[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      result = result.replace(`{${name}}`, String(value));
    }
  }
  return result;
}

vi.mock("next-intl", () => ({
  useTranslations: () => t,
}));

describe("DatabaseConsistencyPanel", () => {
  describe("cluster scope", () => {
    it("renders compact ok state with counts", async () => {
      const { DatabaseConsistencyPanel } = await import(
        "@/components/resources/database-consistency-panel"
      );

      const result: ClusterConsistencyResult = {
        status: "ok",
        counts: { members: 2, topologyDatabaseNodes: 3 },
        issues: [],
      };

      render(<DatabaseConsistencyPanel scope="cluster" result={result} />);

      expect(screen.getByText("Page information check")).toBeInTheDocument();
      expect(screen.getByText("Information aligned")).toBeInTheDocument();
      expect(screen.getByText("2 members · 3 topology database instances")).toBeInTheDocument();
      expect(screen.getByText("Current page information is aligned.")).toBeInTheDocument();
    });

    it("renders warning issues", async () => {
      const { DatabaseConsistencyPanel } = await import(
        "@/components/resources/database-consistency-panel"
      );

      const result: ClusterConsistencyResult = {
        status: "warning",
        counts: { members: 1, topologyDatabaseNodes: 1 },
        issues: [
          {
            id: "member-role-missing-22",
            kind: "missing_profile",
            severity: "warning",
            messageKey: "databaseConsistency.issues.memberRoleMissing",
            resourceName: "Payment MySQL Replica",
          },
        ],
      };

      render(<DatabaseConsistencyPanel scope="cluster" result={result} />);

      expect(screen.getByText("Needs information review")).toBeInTheDocument();
      expect(screen.getByText("Payment MySQL Replica")).toBeInTheDocument();
      expect(screen.getByText("Backend did not provide role information.")).toBeInTheDocument();
    });

    it("sets data-consistency-scope attribute", async () => {
      const { DatabaseConsistencyPanel } = await import(
        "@/components/resources/database-consistency-panel"
      );

      const result: ClusterConsistencyResult = {
        status: "ok",
        counts: { members: 1, topologyDatabaseNodes: 1 },
        issues: [],
      };

      const { container } = render(
        <DatabaseConsistencyPanel scope="cluster" result={result} />,
      );

      expect(container.querySelector("[data-consistency-scope]")).toHaveAttribute(
        "data-consistency-scope",
        "cluster",
      );
    });
  });

  describe("instance scope", () => {
    it("renders ok state without counts showing instanceSummary", async () => {
      const { DatabaseConsistencyPanel } = await import(
        "@/components/resources/database-consistency-panel"
      );

      const result: InstanceConsistencyResult = {
        status: "ok",
        facts: {
          parentClusterName: "Payment Cluster",
          role: "primary",
          connection: "db-host:3306",
        },
        issues: [],
      };

      render(<DatabaseConsistencyPanel scope="instance" result={result} />);

      expect(screen.getByText("Page information check")).toBeInTheDocument();
      expect(screen.getByText("Information aligned")).toBeInTheDocument();
      expect(
        screen.getByText("Instance profile, cluster link, and topology are consistent."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/members ·/)).not.toBeInTheDocument();
    });

    it("renders warning issues for instance scope", async () => {
      const { DatabaseConsistencyPanel } = await import(
        "@/components/resources/database-consistency-panel"
      );

      const result: InstanceConsistencyResult = {
        status: "warning",
        facts: {},
        issues: [
          {
            id: "instance-role-missing",
            kind: "missing_profile",
            severity: "warning",
            messageKey: "databaseConsistency.issues.instanceRoleMissing",
            resourceName: "orders-db-primary",
          },
        ],
      };

      render(<DatabaseConsistencyPanel scope="instance" result={result} />);

      expect(screen.getByText("Needs information review")).toBeInTheDocument();
      expect(screen.getByText("orders-db-primary")).toBeInTheDocument();
    });

    it("sets data-consistency-scope attribute to instance", async () => {
      const { DatabaseConsistencyPanel } = await import(
        "@/components/resources/database-consistency-panel"
      );

      const result: InstanceConsistencyResult = {
        status: "ok",
        facts: {},
        issues: [],
      };

      const { container } = render(
        <DatabaseConsistencyPanel scope="instance" result={result} />,
      );

      expect(container.querySelector("[data-consistency-scope]")).toHaveAttribute(
        "data-consistency-scope",
        "instance",
      );
    });

    it("does not render old generic data consistency wording", async () => {
      const { DatabaseConsistencyPanel } = await import(
        "@/components/resources/database-consistency-panel"
      );

      const result: InstanceConsistencyResult = {
        status: "ok",
        facts: { parentClusterName: "Cluster", role: "primary", connection: "db:3306" },
        issues: [],
      };

      render(<DatabaseConsistencyPanel scope="instance" result={result} />);

      expect(screen.queryByText("Data consistency")).not.toBeInTheDocument();
      expect(screen.queryByText("Data consistent")).not.toBeInTheDocument();
    });
  });
});
