import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { buildQueryTarget } from "@/tests/fixtures/query-targets";

const { getTranslationsMock, getQueryTargetsMock } = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
  getQueryTargetsMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock("@/services/query-targets", () => ({
  getQueryTargets: getQueryTargetsMock,
}));

vi.mock("@/components/blocks/page-header", () => ({
  PageHeader: ({ description }: { description: ReactNode }) => <p>{description}</p>,
}));

vi.mock("@/components/query/query-workbench", () => ({
  QueryWorkbench: () => null,
}));

import QueryWorkbenchPage from "@/app/(console)/query/page";

describe("/query page intro", () => {
  it("renders the workbench directly without a hero description", async () => {
    getTranslationsMock.mockResolvedValue(
      Object.assign(
        (key: string) => key,
        { rich: (key: string) => key },
      ),
    );
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 1 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    render(await QueryWorkbenchPage({ searchParams: Promise.resolve({}) }));

    // Phase 38I removed the hero — the page renders only the workbench shell.
    expect(screen.queryByText("只读凭据")).toBeNull();
  });
});
