// input: localized messages and resource view-model fixtures
// output: regression coverage for the Overview attention queue, expansion, and readable localized reasons
// pos: component test for exact actionable membership, expansion, and labels
// note: if this file changes, update this header and tests/components/README.md.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("expands the exact actionable union beyond the collapsed ten-row view", async () => {
    const user = userEvent.setup();
    const resources = [
      makeResource({ id: 1, displayName: "Healthy baseline" }),
      makeResource({
        id: 2,
        displayName: "Lifecycle-only",
        lifecycleStatus: "stopped",
      }),
      makeResource({
        id: 3,
        displayName: "Member signal-only",
        databaseOperationalSummary: {
          memberCount: 2,
          criticalMemberCount: 1,
          warningMemberCount: 0,
          stoppedMemberCount: 0,
          degradedMemberCount: 0,
          unknownRoleCount: 0,
          primaryMemberCount: 1,
          replicaMemberCount: 1,
        },
      }),
      makeResource({
        id: 4,
        displayName: "Health-only",
        healthStatus: "critical",
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        makeResource({
          id: 10 + index,
          displayName: `Lifecycle filler ${index + 1}`,
          lifecycleStatus: "stopped",
        }),
      ),
    ];

    renderEn(
      <OverviewContent resources={resources} attentionResources={resources} />,
    );

    expect(screen.getByRole("link", { name: "Lifecycle-only" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Member signal-only" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Health-only" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Healthy baseline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lifecycle filler 8" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("row").filter((row) => row.closest("tbody"))).toHaveLength(10);

    const viewAll = screen.getByRole("button", { name: "View all attention items" });
    expect(viewAll).toHaveAttribute("aria-expanded", "false");
    expect(viewAll).toHaveAttribute("aria-controls", "overview-attention-table");
    expect(screen.queryByRole("link", { name: "View all attention items" })).not.toBeInTheDocument();

    await user.click(viewAll);

    expect(screen.getAllByRole("row").filter((row) => row.closest("tbody"))).toHaveLength(11);
    for (const name of [
      "Health-only",
      "Member signal-only",
      "Lifecycle-only",
      "Lifecycle filler 1",
      "Lifecycle filler 2",
      "Lifecycle filler 3",
      "Lifecycle filler 4",
      "Lifecycle filler 5",
      "Lifecycle filler 6",
      "Lifecycle filler 7",
      "Lifecycle filler 8",
    ]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Healthy baseline" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer attention items" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("localizes the accessible expansion toggle in zh-CN", async () => {
    const user = userEvent.setup();
    const resources = Array.from({ length: 11 }, (_, index) =>
      makeResource({
        id: index + 1,
        displayName: `已停止资源 ${index + 1}`,
        lifecycleStatus: "stopped",
      }),
    );

    renderZh(
      <OverviewContent resources={resources} attentionResources={resources} />,
    );

    const viewAll = screen.getByRole("button", { name: "查看全部关注项" });
    expect(viewAll).toHaveAttribute("aria-expanded", "false");

    await user.click(viewAll);

    expect(screen.getByRole("button", { name: "收起关注项" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getAllByRole("row").filter((row) => row.closest("tbody"))).toHaveLength(11);
  });

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

  it("uses readable localized fallback copy for provisioning lifecycle attention", () => {
    const resource = makeResource({ lifecycleStatus: "provisioning" });

    renderZh(
      <OverviewContent resources={[resource]} attentionResources={[resource]} />,
    );

    expect(screen.getByText("生命周期状态：创建中")).toBeInTheDocument();
    expect(screen.queryByText(/diagnostics\.reasons\.lifecycleStatus/)).not.toBeInTheDocument();
  });
});
