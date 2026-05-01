import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { InstanceConsistencyResult } from "@/lib/database-read-model-consistency";

function t(key: string) {
  const keys: Record<string, string> = {
    "instanceContext.title": "Instance context",
    "instanceContext.description": "Parent cluster, role, and connection facts.",
    "instanceContext.parentCluster": "Parent cluster",
    "instanceContext.role": "Role",
    "instanceContext.connection": "Connection",
    "instanceContext.missing": "Not provided by backend",
  };
  return keys[key] ?? key;
}

vi.mock("next-intl", () => ({
  useTranslations: () => t,
}));

describe("DatabaseInstanceContextPanel", () => {
  it("renders parent cluster, role, and connection", async () => {
    const { DatabaseInstanceContextPanel } = await import(
      "@/components/resources/database-instance-context-panel"
    );

    const result: InstanceConsistencyResult = {
      status: "ok",
      facts: {
        parentClusterName: "Payment MySQL Cluster Production",
        role: "primary",
        connection: "prod-db-host-02.internal:3307",
      },
      issues: [],
    };

    render(<DatabaseInstanceContextPanel result={result} />);

    expect(screen.getByText("Instance context")).toBeInTheDocument();
    expect(screen.getByText("Payment MySQL Cluster Production")).toBeInTheDocument();
    expect(screen.getByText("primary")).toBeInTheDocument();
    expect(screen.getByText("prod-db-host-02.internal:3307")).toBeInTheDocument();
  });

  it("renders explicit missing value text", async () => {
    const { DatabaseInstanceContextPanel } = await import(
      "@/components/resources/database-instance-context-panel"
    );

    const result: InstanceConsistencyResult = {
      status: "warning",
      facts: {},
      issues: [],
    };

    render(<DatabaseInstanceContextPanel result={result} />);

    expect(screen.getAllByText("Not provided by backend").length).toBeGreaterThan(0);
  });
});
