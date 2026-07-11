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
  it("keeps the Chinese read-only credential phrase together", async () => {
    const description =
      "查看可查询的数据库目标、连接上下文与治理策略。仅已就绪且配置只读凭据的目标允许执行查询。";
    getTranslationsMock.mockResolvedValue(
      Object.assign(
        (key: string) => (key === "pages.query.description" ? description : key),
        {
          rich: (
            key: string,
            tags: { readonly nowrap: (chunks: ReactNode) => ReactNode },
          ) =>
            key === "pages.query.description" ? (
              <>
                查看可查询的数据库目标、连接上下文与治理策略。仅已就绪且配置
                {tags.nowrap("只读凭据")}的目标允许执行查询。
              </>
            ) : (
              key
            ),
        },
      ),
    );
    getQueryTargetsMock.mockResolvedValue({
      items: [buildQueryTarget({ resourceId: 1 })],
      pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    });

    render(await QueryWorkbenchPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("只读凭据")).toHaveClass("whitespace-nowrap");
  });
});
