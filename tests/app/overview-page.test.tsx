// input: Vitest, Next request cookies, and Overview route page
// output: regression coverage for cookie-scoped Overview loading and explicit all override
// pos: app route seam test for the authenticated Overview page
// note: if this file changes, update this header and tests/app/README.md.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  getTranslationsMock,
  listOverviewResourceViewModelsMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getTranslationsMock: vi.fn(),
  listOverviewResourceViewModelsMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next-intl/server", () => ({ getTranslations: getTranslationsMock }));
vi.mock("@/lib/view-models", () => ({
  listAllResourceViewModels: vi.fn().mockResolvedValue([]),
  listAttentionResourceViewModels: vi.fn().mockResolvedValue([]),
  listOverviewResourceViewModels: listOverviewResourceViewModelsMock,
}));
vi.mock("@/components/blocks/page-header", () => ({
  PageHeader: () => null,
}));
vi.mock("@/components/overview/overview-content", () => ({
  OverviewContent: () => null,
}));

import OverviewPage from "@/app/(console)/overview/page";

describe("/overview page", () => {
  it("parses the environment cookie and scopes the combined server loader", async () => {
    const cookieStore = { get: vi.fn().mockReturnValue({ value: "42" }) };
    cookiesMock.mockResolvedValue(cookieStore);
    getTranslationsMock.mockResolvedValue((key: string) => key);
    listOverviewResourceViewModelsMock.mockResolvedValue({
      resources: [],
      attentionResources: [],
    });

    render(await OverviewPage());

    expect(cookieStore.get).toHaveBeenCalledWith("controlhub.environmentId");
    expect(listOverviewResourceViewModelsMock).toHaveBeenCalledWith({ environmentId: 42 });
  });

  it("lets an explicit all-environments URL override a stale environment cookie", async () => {
    const cookieStore = { get: vi.fn().mockReturnValue({ value: "42" }) };
    cookiesMock.mockResolvedValue(cookieStore);
    getTranslationsMock.mockResolvedValue((key: string) => key);
    listOverviewResourceViewModelsMock.mockResolvedValue({
      resources: [],
      attentionResources: [],
    });
    const pageWithSearchParams = OverviewPage as unknown as (props: {
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => ReturnType<typeof OverviewPage>;

    render(await pageWithSearchParams({
      searchParams: Promise.resolve({ environment: "all" }),
    }));

    expect(listOverviewResourceViewModelsMock).toHaveBeenCalledWith({});
  });
});
