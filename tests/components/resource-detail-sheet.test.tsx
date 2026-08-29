// input: vitest, testing-library, resource detail sheet, auth-role
// output: detail sheet tests including health evidence and admin-only mutation affordances
// pos: component tests for the resource detail sheet and Issue 81 health readout
// note: if this file changes, update this header and module README.md.
import { NextIntlClientProvider } from "next-intl";
import { formatDateTime } from "@/lib/format";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ResourceDetailSheet } from "@/components/resources/resource-detail-sheet";
import messages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

let isAdmin: boolean | null = null;
vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/blocks/topology-panel", () => ({
  TopologyPanel: ({ resourceId }: { resourceId: number }) => (
    <div data-testid="topology-panel-mock">{resourceId}</div>
  ),
}));

vi.mock("@/components/resources/edit-resource-sheet", () => ({
  EditResourceSheet: () => null,
}));

vi.mock("@/components/blocks/resource-relation-panel", () => ({
  ResourceRelationPanel: ({ relations }: { relations: Array<{ id: number; relatedResourceName: string }> }) => (
    <div>
      {relations.map((r) => (
        <div key={r.id}>{r.relatedResourceName}</div>
      ))}
    </div>
      ),
}));
import type { ResourceDetailViewModel } from "@/types/view-models";

const resource: ResourceDetailViewModel = {
  id: 101,
  resourceType: "database_instance",
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: 1,
  environmentName: "Production",
  ownerId: 1,
  ownerName: "DBA Team",
  lifecycleStatus: "running",
  healthStatus: "degraded",
  healthFreshness: "fresh",
  healthObservedAt: "2026-04-11T12:55:00Z",
  healthObserver: "prometheus",
  manualHealthOverride: null,
  source: "manual",
  externalId: "aws:rds:orders-primary",
  createdAt: "2026-04-11T12:00:00Z",
  updatedAt: "2026-04-11T13:00:00Z",
  labels: {
    team: "order",
    role: "primary",
  },
  summary: "Primary transactional database handling checkout and order writes.",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  isArchived: false,
  profile: {
    engine: "MySQL 8.0",
    endpoint: "orders-primary.internal:3306",
    region: "ap-southeast-1",
  },
  relations: [
    {
      id: 201,
      fromResourceId: 101,
      toResourceId: 202,
      relationType: "member_of",
      createdAt: "2026-04-11T13:00:00Z",
      relatedResourceId: 202,
      relatedResourceName: "orders-cluster",
      direction: "outgoing",
    },
  ],
  auditEvents: [
    {
      id: 301,
      actorUserId: 1,
      targetResourceId: 101,
      eventType: "resource.updated",
      result: "success",
      createdAt: "2026-04-11T13:00:00Z",
      actorLabel: "Admin User",
      targetResourceName: "Orders DB Primary",
      environmentLabel: "Production",
      summary: "Updated lifecycle status and owner mapping.",
    },
  ],
};

describe("ResourceDetailSheet", () => {
  beforeEach(() => {
    isAdmin = null;
  });

  it("hides edit and archive mutation affordances for non-admin operators", () => {
    isAdmin = false;

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("shows edit and archive mutation affordances for administrators", () => {
    isAdmin = true;

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("closes when the overlay is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    function ControlledSheet() {
      const [open, setOpen] = useState(true);
      return (
        <NextIntlClientProvider locale="en" messages={messages}>
          <ResourceDetailSheet
            open={open}
            onOpenChange={(nextOpen) => {
              onOpenChange(nextOpen);
              setOpen(nextOpen);
            }}
            resource={resource}
          />
        </NextIntlClientProvider>
      );
    }

    render(<ControlledSheet />);

    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).toBeInTheDocument();

    await user.pointer({ target: overlay as Element, keys: "[MouseLeft]" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the selected resource with summary, relations, and audit context", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheet
          open
          onOpenChange={() => undefined}
          resource={resource}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Orders DB Primary")).toBeInTheDocument();
    expect(screen.getByText("DB Instance · mysql · Running")).toBeInTheDocument();
    expect(screen.getByText("orders-primary.internal:3306")).toBeInTheDocument();
    expect(screen.getByText("orders-cluster")).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("Fresh")).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(resource.healthObservedAt!, "en"))).toBeInTheDocument();
    expect(screen.getByText("prometheus")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open full detail/i }),
    ).toHaveAttribute("href", "/resources/101");
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("shows empty states when profile, relations, or audit events are absent", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceDetailSheet
          open
          onOpenChange={() => undefined}
          resource={{
            ...resource,
            profile: {},
            relations: [],
            auditEvents: [],
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByText("Not set")).not.toHaveLength(0);
    expect(screen.getByText("No audit activity yet")).toBeInTheDocument();
  });

  it("shows localized fallback summary in zh-CN without English type/status leaks", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    // Resource with no explicit resourceSummaries key — triggers fallback path
    const fallbackResource: ResourceDetailViewModel = {
      ...resource,
      id: 4100001,
      resourceType: "database_cluster",
      resourceSubtype: "mysql",
      lifecycleStatus: "running",
      // English fallback from buildFallbackSummary — should NOT appear
      summary: "Database Cluster · Mysql · Running",
    };

    expect(Number.isSafeInteger(fallbackResource.id)).toBe(true);

    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhMessages}>
        <ResourceDetailSheet
          open
          onOpenChange={() => undefined}
          resource={fallbackResource}
        />
      </NextIntlClientProvider>,
    );

    // Summary must not contain English fallback words
    expect(screen.queryByText(/Database Cluster/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Running/)).not.toBeInTheDocument();

    // Must contain Chinese type and status (may appear in summary + badge)
    expect(screen.getAllByText(/数据库集群/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/运行中/).length).toBeGreaterThanOrEqual(1);

    consoleError.mockRestore();
  });

  it("shows localized fallback summary for degraded status in zh-CN", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const fallbackResource: ResourceDetailViewModel = {
      ...resource,
      id: 4100002,
      resourceType: "database_cluster",
      resourceSubtype: "mysql",
      lifecycleStatus: "degraded",
      summary: "Database Cluster · Mysql · Degraded",
    };

    expect(Number.isSafeInteger(fallbackResource.id)).toBe(true);

    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhMessages}>
        <ResourceDetailSheet
          open
          onOpenChange={() => undefined}
          resource={fallbackResource}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText(/Database Cluster/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Degraded/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/降级/).length).toBeGreaterThanOrEqual(1);

    consoleError.mockRestore();
  });

  it("localizes resource type in header description with zh-CN", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const fallbackResource: ResourceDetailViewModel = {
      ...resource,
      id: 4100001,
      resourceType: "database_cluster",
      resourceSubtype: "mysql",
      summary: "Database Cluster · Mysql · Running",
    };

    expect(Number.isSafeInteger(fallbackResource.id)).toBe(true);

    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhMessages}>
        <ResourceDetailSheet
          open
          onOpenChange={() => undefined}
          resource={fallbackResource}
        />
      </NextIntlClientProvider>,
    );

    // Header description should not show "Database Cluster"
    expect(screen.queryByText(/Database Cluster/)).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});
