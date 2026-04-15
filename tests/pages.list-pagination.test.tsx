import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditEventViewModel, AuditEventViewModelListResponse, ResourceListViewModel, ResourceListViewModelResponse } from "@/types/view-models";

const listResourceViewModelsMock = vi.fn();
const listDatabaseResourceViewModelsMock = vi.fn();
const listAuditEventViewModelsMock = vi.fn();
const listRecentAuditEventViewModelsMock = vi.fn();
const getDatabasePostureCountsMock = vi.fn();
const listResourceTypesMock = vi.fn();
const getTranslationsMock = vi.fn();
const resourceTableMock = vi.fn();
const cmdbTableMock = vi.fn();
const databaseTableMock = vi.fn();
const auditTableMock = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock("@/lib/view-models", () => ({
  listResourceViewModels: listResourceViewModelsMock,
  listDatabaseResourceViewModels: listDatabaseResourceViewModelsMock,
  listAuditEventViewModels: listAuditEventViewModelsMock,
  listRecentAuditEventViewModels: listRecentAuditEventViewModelsMock,
  getDatabasePostureCounts: getDatabasePostureCountsMock,
}));

vi.mock("@/services/settings", () => ({
  listResourceTypes: listResourceTypesMock,
}));

vi.mock("@/components/blocks/page-header", () => ({
  PageHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/resources/resource-table", () => ({
  ResourceTable: (props: unknown) => {
    resourceTableMock(props);
    return <div>resource-table</div>;
  },
}));

vi.mock("@/components/cmdb/cmdb-table", () => ({
  CmdbTable: (props: unknown) => {
    cmdbTableMock(props);
    return <div>cmdb-table</div>;
  },
}));

vi.mock("@/components/databases/database-table", () => ({
  DatabaseTable: (props: unknown) => {
    databaseTableMock(props);
    return <div>database-table</div>;
  },
}));

vi.mock("@/components/audits/audit-table", () => ({
  AuditTable: (props: unknown) => {
    auditTableMock(props);
    return <div>audit-table</div>;
  },
}));

vi.mock("@/components/blocks/detail-panel", () => ({
  DetailPanel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/blocks/activity-timeline", () => ({
  ActivityTimeline: () => <div>activity-timeline</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
}));

function t(key: string) {
  return key;
}

function buildResource(page = 1): ResourceListViewModelResponse {
  const items: ResourceListViewModel[] = [
    {
      id: `resource-${page}`,
      resourceType: "service",
      resourceSubtype: "api",
      name: `orders-api-${page}`,
      displayName: `Orders API ${page}`,
      environmentId: "env-prod",
      ownerId: "owner-app",
      ownerName: "Applications",
      environmentName: "Production",
      lifecycleStatus: "running",
      healthStatus: "warning",
      source: "manual",
      externalId: `svc:orders-api:${page}`,
      labels: {},
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      isArchived: false,
      summary: "Orders API summary",
    },
  ];

  return {
    items,
    pageInfo: {
      page,
      pageSize: 20,
      totalItems: 40,
      totalPages: 2,
    },
  };
}

function buildAuditResponse(page = 1): AuditEventViewModelListResponse {
  const items: AuditEventViewModel[] = [
    {
      id: `audit-${page}`,
      actorUserId: "user-1",
      targetResourceId: "resource-1",
      eventType: "resource.updated",
      result: "success",
      createdAt: "2026-04-14T10:00:00Z",
      actorLabel: "ControlHub Admin",
      targetResourceName: "Orders API",
      environmentLabel: "Production",
      summary: "Updated successfully.",
    },
  ];

  return {
    items,
    pageInfo: {
      page,
      pageSize: 20,
      totalItems: 30,
      totalPages: 2,
    },
  };
}

describe("list pages pagination contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue(t);
    listResourceTypesMock.mockResolvedValue([]);
    listResourceViewModelsMock.mockResolvedValue(buildResource());
    listDatabaseResourceViewModelsMock.mockResolvedValue(buildResource());
    listAuditEventViewModelsMock.mockResolvedValue(buildAuditResponse());
    listRecentAuditEventViewModelsMock.mockResolvedValue([]);
    getDatabasePostureCountsMock.mockResolvedValue({
      clusters: 2,
      instances: 2,
    });
    resourceTableMock.mockClear();
    cmdbTableMock.mockClear();
    databaseTableMock.mockClear();
    auditTableMock.mockClear();
  });

  it("normalizes resources page search params and ignores legacy type", async () => {
    const { default: ResourcesPage } = await import("@/app/(console)/resources/page");

    await ResourcesPage({
      searchParams: Promise.resolve({
        page: "0",
        pageSize: "abc",
        resourceType: "service",
        type: "host",
        lifecycleStatus: "running",
        healthStatus: "warning",
        environmentId: "env-prod",
        q: "  orders  ",
      }),
    });

    expect(listResourceViewModelsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      resourceType: "service",
      lifecycleStatus: "running",
      healthStatus: "warning",
      environmentId: "env-prod",
      q: "orders",
    });
  });

  it("passes normalized page params to cmdb", async () => {
    const { default: CmdbPage } = await import("@/app/(console)/cmdb/page");

    await CmdbPage({
      searchParams: Promise.resolve({
        page: "2",
        pageSize: "50",
        environmentId: "env-stage",
        q: "  billing  ",
      }),
    });

    expect(listResourceViewModelsMock).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      environmentId: "env-stage",
      q: "billing",
    });
  });

  it("passes normalized page params to databases", async () => {
    const { default: DatabasesPage } = await import("@/app/(console)/databases/page");

    await DatabasesPage({
      searchParams: Promise.resolve({
        page: "3",
        pageSize: "10",
        environmentId: "env-prod",
        q: "  mysql  ",
      }),
    });

    expect(listDatabaseResourceViewModelsMock).toHaveBeenCalledWith({
      page: 3,
      pageSize: 10,
      environmentId: "env-prod",
      q: "mysql",
    });
  });

  it("passes normalized audit filters and page params", async () => {
    const { default: AuditsPage } = await import("@/app/(console)/audits/page");

    await AuditsPage({
      searchParams: Promise.resolve({
        page: "4",
        pageSize: "25",
        targetResourceId: "resource-2",
        eventType: "resource.updated",
        result: "success",
      }),
    });

    expect(listAuditEventViewModelsMock).toHaveBeenCalledWith({
      page: 4,
      pageSize: 25,
      targetResourceId: "resource-2",
      eventType: "resource.updated",
      result: "success",
    });
  });

  it("passes paginated resource response shape into the resources table", async () => {
    const response = buildResource(2);
    listResourceViewModelsMock.mockResolvedValueOnce(response);
    const { default: ResourcesPage } = await import("@/app/(console)/resources/page");

    const element = await ResourcesPage({
      searchParams: Promise.resolve({
        page: "2",
      }),
    });

    render(element);

    expect(resourceTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: response.items,
        pageInfo: response.pageInfo,
      }),
    );
  });

  it("passes paginated resource response shape into the cmdb table", async () => {
    const response = buildResource(3);
    listResourceViewModelsMock.mockResolvedValueOnce(response);
    const { default: CmdbPage } = await import("@/app/(console)/cmdb/page");

    const element = await CmdbPage({
      searchParams: Promise.resolve({
        page: "3",
      }),
    });

    render(element);

    expect(cmdbTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: response.items,
        pageInfo: response.pageInfo,
      }),
    );
  });

  it("passes paginated resource response shape into the databases table", async () => {
    const response = buildResource(4);
    listDatabaseResourceViewModelsMock.mockResolvedValueOnce(response);
    const { default: DatabasesPage } = await import("@/app/(console)/databases/page");

    const element = await DatabasesPage({
      searchParams: Promise.resolve({
        page: "4",
      }),
    });

    render(element);

    expect(databaseTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: response.items,
        pageInfo: response.pageInfo,
      }),
    );
  });

  it("uses dedicated posture totals instead of the current paginated database slice", async () => {
    listDatabaseResourceViewModelsMock.mockResolvedValueOnce({
      items: [
        {
          ...buildResource(1).items[0],
          resourceType: "database_instance",
          displayName: "Orders DB Primary",
        },
      ],
      pageInfo: {
        page: 2,
        pageSize: 1,
        totalItems: 4,
        totalPages: 4,
      },
    });
    const { default: DatabasesPage } = await import("@/app/(console)/databases/page");

    const element = await DatabasesPage({
      searchParams: Promise.resolve({
        page: "2",
        pageSize: "1",
      }),
    });

    const { container } = render(element);

    expect(getDatabasePostureCountsMock).toHaveBeenCalledWith({
      page: 2,
      pageSize: 1,
    });
    expect(container).toHaveTextContent("2");
  });

  it("passes paginated audit response shape into the audits table", async () => {
    const response = buildAuditResponse(5);
    listAuditEventViewModelsMock.mockResolvedValueOnce(response);
    const { default: AuditsPage } = await import("@/app/(console)/audits/page");

    const element = await AuditsPage({
      searchParams: Promise.resolve({
        page: "5",
      }),
    });

    render(element);

    expect(auditTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        events: response.items,
        pageInfo: response.pageInfo,
      }),
    );
  });
});
