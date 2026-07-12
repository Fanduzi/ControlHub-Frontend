import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryTarget } from "@/types/query-target";
import type { WorkbenchFilters } from "@/lib/query-target-display";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";

const {
  getTranslationsMock,
  getQueryTargetsMock,
  captured,
} = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  getQueryTargetsMock: vi.fn(),
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

import QueryWorkbenchPage from "@/app/(console)/query/page";

describe("/query page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue(Object.assign((key: string) => key, { rich: (key: string) => key }));
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
      searchParams: Promise.resolve({}),
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
      searchParams: Promise.resolve({ engine: "mysql", q: "redis" }),
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
      searchParams: Promise.resolve({ engine: "mysql", q: "orders" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      engine: "mysql",
      q: "orders",
    });
  });

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
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
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
      searchParams: Promise.resolve({ targetId: "42" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenCalledTimes(2);
    expect(getQueryTargetsMock).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 50,
    });
    expect(getQueryTargetsMock).toHaveBeenNthCalledWith(2, {
      targetId: 42,
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
      searchParams: Promise.resolve({ targetId: "42" }),
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
      searchParams: Promise.resolve({ targetId: "42" }),
    });
    render(element);

    expect(getQueryTargetsMock).toHaveBeenNthCalledWith(2, {
      targetId: 42,
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
      searchParams: Promise.resolve({ targetId: "42" }),
    });
    render(element);

    expect(captured.targets?.map((target) => target.resourceId)).toEqual([1]);
    expect(captured.initialActiveTargetId).toBeNull();
  });
});
