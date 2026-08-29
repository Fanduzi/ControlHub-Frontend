import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import zhMessages from "@/messages/zh-CN.json";
import enMessages from "@/messages/en.json";

import { OverviewContent } from "@/components/overview/overview-content";
import type { ResourceListViewModel } from "@/types/view-models";

vi.mock("@/components/providers/environment-provider", () => ({
  useEnvironment: () => ({
    environments: [],
    currentEnvironmentId: null,
  }),
}));

function makeResource(
  overrides: Partial<ResourceListViewModel>,
): ResourceListViewModel {
  return {
    id: 1,
    name: "db-cluster",
    displayName: "DB Cluster",
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

function renderZh(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="zh-CN" messages={zhMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function renderEn(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("OverviewContent attention reason", () => {
  it("does not use = in zh-CN critical health reason", () => {
    const resource = makeResource({ healthStatus: "critical", lifecycleStatus: "running" });
    renderZh(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    const reasonCells = screen.getAllByText(/健康状态：严重/);
    expect(reasonCells.length).toBeGreaterThan(0);

    expect(screen.queryByText(/健康=/)).not.toBeInTheDocument();
    expect(screen.queryByText(/=严重/)).not.toBeInTheDocument();
  });

  it("does not use = in zh-CN stopped lifecycle reason", () => {
    const resource = makeResource({ healthStatus: "warning", lifecycleStatus: "stopped" });
    renderZh(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    expect(screen.queryByText(/生命周期=/)).not.toBeInTheDocument();
    expect(screen.queryByText(/=已停止/)).not.toBeInTheDocument();
  });

  it("renders English health reason correctly", () => {
    const resource = makeResource({ healthStatus: "critical", lifecycleStatus: "running" });
    renderEn(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    expect(screen.getByText(/Health status: Critical/)).toBeInTheDocument();
    expect(screen.queryByText(/Health=/)).not.toBeInTheDocument();
  });

  it("joins multiple reasons with Chinese comma", () => {
    const resource = makeResource({ healthStatus: "warning", lifecycleStatus: "stopped" });
    renderZh(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    const text = screen.getByText(/健康状态：告警/);
    expect(text.textContent).toContain("，");
    expect(text.textContent).toContain("生命周期状态：已停止");
  });

  it("shows member signal reason for database cluster with critical member", () => {
    const resource = makeResource({
      healthStatus: "healthy",
      lifecycleStatus: "running",
      resourceType: "database_cluster",
      databaseOperationalSummary: {
        memberCount: 2,
        criticalMemberCount: 1,
        warningMemberCount: 0,
        stoppedMemberCount: 0,
        degradedMemberCount: 0,
        unknownRoleCount: 0,
        primaryMemberCount: 0,
        replicaMemberCount: 2,
        worstMemberName: "Analytics ClickHouse Node 02",
        worstMemberStatus: "critical",
      },
    });
    renderZh(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    expect(screen.getByText(/成员信号：1 个成员严重/)).toBeInTheDocument();
    expect(screen.queryByText(/健康状态/)).not.toBeInTheDocument();
  });

  it("shows member signal reason in English for cluster with critical member", () => {
    const resource = makeResource({
      healthStatus: "healthy",
      lifecycleStatus: "running",
      resourceType: "database_cluster",
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
    });
    renderEn(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    expect(screen.getByText(/Member signal: 1 Critical/)).toBeInTheDocument();
  });

  it("falls back to health reason for database cluster without member signal", () => {
    const resource = makeResource({
      healthStatus: "critical",
      lifecycleStatus: "running",
      resourceType: "database_cluster",
    });
    renderZh(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    expect(screen.getByText(/健康状态：严重/)).toBeInTheDocument();
    expect(screen.queryByText(/成员信号/)).not.toBeInTheDocument();
  });

  it("uses health reason for non-database resource types", () => {
    const resource = makeResource({
      healthStatus: "critical",
      lifecycleStatus: "running",
      resourceType: "service",
      resourceSubtype: "api",
    });
    renderZh(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    expect(screen.getByText(/健康状态：严重/)).toBeInTheDocument();
  });

  it("counts pending posture as actionable-attention membership for non-running lifecycle values", () => {
    const resources = [
      makeResource({ id: 1, displayName: "Stopped cluster", lifecycleStatus: "stopped" }),
      makeResource({ id: 2, displayName: "Failed cluster", lifecycleStatus: "failed" }),
      makeResource({ id: 3, displayName: "Provisioning cluster", lifecycleStatus: "provisioning" }),
      makeResource({ id: 4, displayName: "Running cluster", lifecycleStatus: "running" }),
    ];

    renderEn(
      <OverviewContent resources={resources} attentionResources={resources} />,
    );

    const attentionRows = screen.getAllByRole("row").filter((row) => row.closest("tbody"));
    expect(screen.getByText("Pending").nextElementSibling?.textContent).toBe(
      String(attentionRows.length),
    );
  });
});
