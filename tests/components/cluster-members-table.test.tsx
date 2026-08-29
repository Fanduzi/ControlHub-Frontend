import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import zhMessages from "@/messages/zh-CN.json";
import enMessages from "@/messages/en.json";

import { ClusterMembersTable } from "@/components/blocks/cluster-members-table";
import type { ClusterMember } from "@/types/resource";

vi.mock("@/components/providers/environment-provider", () => ({
  useEnvironment: () => ({
    environments: [],
    currentEnvironmentId: null,
  }),
}));

function makeMember(overrides: Partial<ClusterMember>): ClusterMember {
  return {
    id: 1,
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

describe("ClusterMembersTable", () => {
  it("renders the localized empty state for an empty member list", () => {
    renderZh(<ClusterMembersTable members={[]} />);

    expect(screen.getByText("未找到成员实例。")).toBeInTheDocument();
  });

  it("renders explicit missing role label when role is absent", () => {
    const member = makeMember({ profileSummary: {} });
    renderZh(<ClusterMembersTable members={[member]} />);

    expect(screen.getByText("后端未提供角色信息")).toBeInTheDocument();
  });

  it("renders explicit missing connection label when hostname is absent", () => {
    const member = makeMember({ profileSummary: { role: "replica", port: 3306 } });
    renderZh(<ClusterMembersTable members={[member]} />);

    const connectionLabels = screen.getAllByText("连接地址未提供");
    expect(connectionLabels.length).toBeGreaterThan(0);
  });

  it("renders topology link for abnormal member", () => {
    const abnormal = makeMember({ id: 1, healthStatus: "critical" });
    const healthy = makeMember({ id: 2, displayName: "Healthy", healthStatus: "healthy" });
    renderEn(<ClusterMembersTable members={[abnormal, healthy]} />);

    const links = screen.getAllByText("View topology");
    expect(links.length).toBe(1);

    const link = links[0].closest("a");
    expect(link?.getAttribute("href")).toBe("/resources/1?topologyDepth=2&topologyExpanded=1");
  });

  it("does not render topology link for healthy running member", () => {
    const healthy = makeMember({ healthStatus: "healthy", lifecycleStatus: "running" });
    renderEn(<ClusterMembersTable members={[healthy]} />);

    expect(screen.queryByText("View topology")).not.toBeInTheDocument();
  });

  it("sorts abnormal members before healthy ones", () => {
    const healthy = makeMember({ id: 1, displayName: "Healthy Node", healthStatus: "healthy", lifecycleStatus: "running" });
    const critical = makeMember({ id: 2, displayName: "Critical Node", healthStatus: "critical", lifecycleStatus: "running" });

    renderEn(<ClusterMembersTable members={[healthy, critical]} />);

    const rows = screen.getAllByRole("row");
    expect(rows[1].textContent).toContain("Critical Node");
    expect(rows[2].textContent).toContain("Healthy Node");
  });
});
