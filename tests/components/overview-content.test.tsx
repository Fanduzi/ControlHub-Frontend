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
});
