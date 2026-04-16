import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ResourceDetailViewModel } from "@/types/view-models";

const getTranslationsMock = vi.fn();
const getLocaleMock = vi.fn();
const getResourceViewModelMock = vi.fn();
const notFoundMock = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: getTranslationsMock,
  getLocale: getLocaleMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/lib/view-models", () => ({
  getResourceViewModel: getResourceViewModelMock,
}));

vi.mock("@/components/blocks/page-header", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/blocks/detail-panel", () => ({
  DetailPanel: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
}));

vi.mock("@/components/blocks/activity-timeline", () => ({
  ActivityTimeline: () => <div>activity-timeline</div>,
}));

vi.mock("@/components/blocks/resource-relation-panel", () => ({
  ResourceRelationPanel: () => <div>resource-relation-panel</div>,
}));

vi.mock("@/components/blocks/status-badge", () => ({
  StatusBadge: ({ status }: { status: string }) => <div>{status}</div>,
}));

vi.mock("@/components/blocks/topology-panel", () => ({
  TopologyPanel: ({ resourceId }: { resourceId: string }) => <div>topology:{resourceId}</div>,
}));

vi.mock("@/components/resources/resource-detail-edit-button", () => ({
  ResourceDetailEditButton: () => <button>edit</button>,
}));

vi.mock("@/components/resources/resource-archive-button", () => ({
  ResourceArchiveButton: () => <button>archive</button>,
}));

vi.mock("@/i18n/locales", () => ({
  DEFAULT_LOCALE: "en",
  isAppLocale: () => true,
}));

vi.mock("@/lib/format", () => ({
  formatDateTime: (value: string) => value,
  formatLabel: (value: string) => value,
}));

vi.mock("@/lib/resource-copy", () => ({
  getResourceSummaryKey: () => null,
}));

function t(key: string) {
  return key;
}

const resource: ResourceDetailViewModel = {
  id: "res-db-primary",
  resourceType: "database_instance",
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: "env-prod",
  environmentName: "Production",
  ownerId: "owner-dba",
  ownerName: "DBA Team",
  lifecycleStatus: "running",
  healthStatus: "degraded",
  source: "manual",
  externalId: "aws:rds:orders-primary",
  createdAt: "2026-04-11T12:00:00Z",
  updatedAt: "2026-04-11T13:00:00Z",
  labels: { role: "primary" },
  summary: "Primary transactional database handling checkout and order writes.",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  isArchived: false,
  profile: { engine: "MySQL 8.0" },
  relations: [],
  auditEvents: [],
};

describe("ResourceDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue(t);
    getLocaleMock.mockResolvedValue("en");
    getResourceViewModelMock.mockResolvedValue(resource);
  });

  it("elevates topology into a prominent full-width surface before profile content", async () => {
    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: resource.id }),
    });

    const { container } = render(element);
    const topologySurface = container.querySelector("[data-resource-topology-surface]");
    const profileSurface = container.querySelector("[data-resource-profile-surface]");

    expect(topologySurface).not.toBeNull();
    expect(topologySurface).toHaveAttribute("data-resource-topology-surface", "prominent");
    expect(profileSurface).not.toBeNull();
    expect(topologySurface?.compareDocumentPosition(profileSurface as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText(`topology:${resource.id}`)).toBeInTheDocument();
  });
});
