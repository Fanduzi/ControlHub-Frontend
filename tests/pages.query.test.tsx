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
    initialFilters?: WorkbenchFilters;
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
    initialFilters,
  }: {
    targets: QueryTarget[];
    initialFilters: WorkbenchFilters;
  }) => {
    captured.targets = targets;
    captured.initialFilters = initialFilters;
    return <div data-testid="query-workbench">workbench:{targets.length}</div>;
  },
}));

import QueryWorkbenchPage from "@/app/(console)/query/page";

describe("/query page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
    captured.targets = undefined;
    captured.initialFilters = undefined;
  });

  it("renders the page header and the workbench shell", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 1 }), buildQueryTarget({ resourceId: 2 })],
    });

    const element = await QueryWorkbenchPage({
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByRole("heading", { name: "pages.query.title" })).toBeInTheDocument();
    expect(screen.getByTestId("query-workbench")).toHaveTextContent("workbench:2");
  });

  it("passes backend targets and parsed filters to the workbench", async () => {
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 9 })],
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

  it("does not call any query execution service", () => {
    // Only the read-only target fetch is imported by the page.
    expect(getQueryTargetsMock).not.toHaveBeenCalled();
  });
});
