// input: Query Workbench server page props and mocked environment/target services
// output: URL scope, target-selection, and fail-closed page-composition assertions
// pos: route-level regression coverage for Query Workbench server state
// note: if this file changes, update this header and tests/README.md
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryTarget } from "@/types/query-target";
import type { WorkbenchFilters } from "@/lib/query-target-display";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";

const {
  getTranslationsMock,
  getQueryTargetsMock,
  listEnvironmentsMock,
  captured,
} = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  getQueryTargetsMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  captured: {} as {
    targets?: QueryTarget[];
    pageInfo?: { page: number; pageSize: number; totalItems: number; totalPages: number };
    initialFilters?: WorkbenchFilters;
    initialActiveTargetId?: number | null;
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock("@/services/query-targets", () => ({
  getQueryTargets: getQueryTargetsMock,
}));

vi.mock("@/services/settings", () => ({
  listEnvironments: listEnvironmentsMock,
}));

vi.mock("@/components/blocks/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/query/query-workbench", () => ({
  QueryWorkbench: ({
    targets,
    pageInfo,
    initialFilters,
    initialActiveTargetId,
  }: {
    targets: QueryTarget[];
    pageInfo: { page: number; pageSize: number; totalItems: number; totalPages: number };
    initialFilters: WorkbenchFilters;
    initialActiveTargetId?: number | null;
  }) => {
    captured.targets = targets;
    captured.pageInfo = pageInfo;
    captured.initialFilters = initialFilters;
    captured.initialActiveTargetId = initialActiveTargetId;
    return <div data-testid="query-workbench">workbench:{targets.length}</div>;
  },
}));

vi.mock("@/components/settings/query-disclosure-settings", () => ({
  QueryDisclosureSettings: () => <div data-testid="query-disclosure-settings" />,
}));

import QueryWorkbenchPage from "@/app/(console)/query/page";
import QueryDisclosurePoliciesPage from "@/app/(console)/settings/query-disclosure-policies/page";

describe("/query page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue(Object.assign((key: string) => key, { rich: (key: string) => key }));
    listEnvironmentsMock.mockResolvedValue([{ id: 7, slug: "prod" }]);
    captured.targets = undefined;
    captured.pageInfo = undefined;
    captured.initialFilters = undefined;
    captured.initialActiveTargetId = undefined;
  });

  it("renders the workbench shell directly without a page hero", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 1 }), buildQueryTarget({ resourceId: 2 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 },
    });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7" }),
    });
    render(element);

    // Phase 38I removed the hero from /query — the page renders the workbench directly.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByTestId("query-workbench")).toHaveTextContent("workbench:2");
  });

  it("passes backend targets and parsed filters to the workbench", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 9 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7", engine: "mysql", q: "redis" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalled();
    expect(captured.targets).toHaveLength(1);
    expect(captured.targets?.[0].resourceId).toBe(9);
    expect(captured.initialFilters?.engine).toBe("mysql");
    expect(captured.initialFilters?.q).toBe("redis");
  });

  it("forwards server-side q and engine filters to getQueryTargets", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 9 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7", engine: "mysql", q: "orders" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
        environmentId: 7,
        engine: "mysql",
        q: "orders",
    });
  });

  it("forwards the selected environment to the workbench target request", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 9 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      environmentId: 7,
    });
  });

  it("resolves the selector's environment slug for both query pages", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 9 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    const query = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environment: "prod" }),
    });
    render(query);

    expect(getQueryTargetsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 50,
      environmentId: 7,
    });

    const disclosure = await QueryDisclosurePoliciesPage({
      searchParams: Promise.resolve({ environment: "prod" }),
    } as never);
    render(disclosure);

    expect(getQueryTargetsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 25,
      environmentId: 7,
    });
  });

  it("scopes the filtered navigator and selected target lookup to the URL environment", async () => {
    getQueryTargetsMock
      .mockResolvedValueOnce({
        items: [buildQueryTarget({ resourceId: 9 })],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        items: [buildQueryTarget({ resourceId: 42 })],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7", targetId: "42", q: "orders", engine: "mysql" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 50,
      environmentId: 7,
      q: "orders",
      engine: "mysql",
    });
    expect(getQueryTargetsMock).toHaveBeenNthCalledWith(2, {
      targetId: 42,
      environmentId: 7,
    });
  });

  it.each([undefined, "0", "-1", "1.5", "1e2", "9007199254740992"]) (
    "ignores an absent or invalid environment id of %s",
    async (environmentId) => {
      getQueryTargetsMock.mockResolvedValue({
        items: [buildQueryTarget({ resourceId: 9 })],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      });

      const element = await QueryWorkbenchPage({
        searchParams: Promise.resolve({ environmentId }),
      });
      render(element);

      expect(getQueryTargetsMock).not.toHaveBeenCalled();
    },
  );

  it("forwards the selected environment to the disclosure target request", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 9 })],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    });

    const element = await QueryDisclosurePoliciesPage({
      searchParams: Promise.resolve({ environmentId: "7" }),
    } as never);
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      environmentId: 7,
    });
  });

  it.each([undefined, "0", "-1", "1.5", "1e2", "9007199254740992"]) (
    "does not scope disclosure targets for an absent or invalid environment id of %s",
    async (environmentId) => {
      getQueryTargetsMock.mockResolvedValue({
        items: [buildQueryTarget({ resourceId: 9 })],
        pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      });

      const element = await QueryDisclosurePoliciesPage({
        searchParams: Promise.resolve({ environmentId }),
      } as never);
      render(element);

      expect(getQueryTargetsMock).not.toHaveBeenCalled();
    },
  );

  it("does not call any query execution service", () => {
    // Only the read-only target fetch is imported by the page.
    expect(getQueryTargetsMock).not.toHaveBeenCalled();
  });

  /**
   * Phase 38H: The page must call getQueryTargets with bounded pagination
   * defaults (page: 1, pageSize: 50) instead of fetching all targets.
   */
  it("calls getQueryTargets with bounded page and pageSize defaults", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 1 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      environmentId: 7,
    });
  });

  it("fetches the normal navigator page and the selected target context when targetId is present", async () => {
    const navigatorTargets = [
      buildQueryTarget({ resourceId: 1 }),
      buildQueryTarget({ resourceId: 2 }),
    ];
    const selectedTarget = buildQueryTarget({ resourceId: 42 });

    getQueryTargetsMock
      .mockResolvedValueOnce({
        items: navigatorTargets,
        pageInfo: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        items: [selectedTarget],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7", targetId: "42" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledTimes(2);
    expect(getQueryTargetsMock).toHaveBeenNthCalledWith(1, {
      page: 1,
        pageSize: 50,
        environmentId: 7,
    });
    expect(getQueryTargetsMock).toHaveBeenNthCalledWith(2, {
        targetId: 42,
        environmentId: 7,
    });
    expect(captured.targets).toHaveLength(3);
    expect(captured.targets?.map((t) => t.resourceId)).toEqual([1, 2, 42]);
    expect(captured.initialActiveTargetId).toBe(42);
  });

  it("merges selected target into navigator list without duplicating when it already exists in the page", async () => {
    const navigatorTargets = [
      buildQueryTarget({ resourceId: 42 }),
      buildQueryTarget({ resourceId: 5 }),
    ];

    getQueryTargetsMock
      .mockResolvedValueOnce({
        items: navigatorTargets,
        pageInfo: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        items: [buildQueryTarget({ resourceId: 42 })],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7", targetId: "42" }),
    });
    render(element);

    expect(captured.targets).toHaveLength(2);
    expect(captured.targets?.map((t) => t.resourceId)).toEqual([42, 5]);
    expect(captured.initialActiveTargetId).toBe(42);
  });

  it("forwards targetId from URL search params to the second getQueryTargets call", async () => {
    getQueryTargetsMock
      .mockResolvedValueOnce({
        items: [buildQueryTarget({ resourceId: 1 })],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        items: [buildQueryTarget({ resourceId: 42 })],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7", targetId: "42" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenNthCalledWith(2, {
      targetId: 42,
      environmentId: 7,
    });
  });

  it("fails closed when the target lookup does not return the requested target", async () => {
    getQueryTargetsMock
      .mockResolvedValueOnce({
        items: [buildQueryTarget({ resourceId: 1 })],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        items: [buildQueryTarget({ resourceId: 99 })],
        pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7", targetId: "42" }),
    });
    render(element);

    expect(captured.targets?.map((target) => target.resourceId)).toEqual([1]);
    expect(captured.initialActiveTargetId).toBeNull();
  });

  it.each([
    "0",
    "-1",
    "1.5",
    "1e2",
    "not-a-target",
    "",
    ["42"],
    ["42", "43"],
  ])("fails closed for an explicitly invalid targetId of %o", async (targetId) => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 1 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({ environmentId: "7", targetId }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledTimes(1);
    expect(captured.targets?.map((target) => target.resourceId)).toEqual([1]);
    expect(captured.initialActiveTargetId).toBeNull();
  });
});
