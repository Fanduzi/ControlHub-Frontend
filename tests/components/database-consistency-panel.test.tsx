import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ClusterConsistencyResult } from "@/lib/database-read-model-consistency";

function t(key: string, params?: Record<string, number | string>) {
  const keys: Record<string, string> = {
    "title": "Data consistency",
    "description": "Read-only check across members, relations, topology, and profile data.",
    "status.ok": "Data consistent",
    "status.warning": "Needs data review",
    "status.unknown": "Not enough data",
    "counts": "{members} members · {topologyDatabaseNodes} topology database nodes",
    "allSignalsAgree": "All visible database signals agree.",
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
  it("renders compact ok state", async () => {
    const { DatabaseConsistencyPanel } = await import(
      "@/components/resources/database-consistency-panel"
    );

    const result: ClusterConsistencyResult = {
      status: "ok",
      counts: { members: 2, topologyDatabaseNodes: 3 },
      issues: [],
    };

    render(<DatabaseConsistencyPanel result={result} />);

    expect(screen.getByText("Data consistency")).toBeInTheDocument();
    expect(screen.getByText("Data consistent")).toBeInTheDocument();
    expect(screen.getByText("2 members · 3 topology database nodes")).toBeInTheDocument();
    expect(screen.getByText("All visible database signals agree.")).toBeInTheDocument();
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

    render(<DatabaseConsistencyPanel result={result} />);

    expect(screen.getByText("Needs data review")).toBeInTheDocument();
    expect(screen.getByText("Payment MySQL Replica")).toBeInTheDocument();
    expect(screen.getByText("Backend did not provide role information.")).toBeInTheDocument();
  });
});
