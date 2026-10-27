// input: Vitest, Next request cookies, and Audits route page
// output: regression coverage for the admin-only audit route's forbidden notice vs. generic error boundary
// pos: app route seam test for the authenticated Audits page
// note: if this file changes, update this header and tests/app/README.md.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/api-client";

const {
  cookiesMock,
  getTranslationsMock,
  resolveEnvironmentSlugToIdMock,
  parseAuditListSearchParamsMock,
  listAuditEventViewModelsMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getTranslationsMock: vi.fn(),
  resolveEnvironmentSlugToIdMock: vi.fn(),
  parseAuditListSearchParamsMock: vi.fn(),
  listAuditEventViewModelsMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next-intl/server", () => ({ getTranslations: getTranslationsMock }));
vi.mock("@/lib/environment-params", () => ({
  resolveEnvironmentSlugToId: resolveEnvironmentSlugToIdMock,
}));
vi.mock("@/lib/list-page-search-params", () => ({
  parseAuditListSearchParams: parseAuditListSearchParamsMock,
}));
vi.mock("@/lib/view-models", () => ({
  listAuditEventViewModels: listAuditEventViewModelsMock,
}));
vi.mock("@/components/blocks/page-header", () => ({
  PageHeader: () => null,
}));
vi.mock("@/components/audits/audit-table", () => ({
  AuditTable: () => null,
}));

import AuditsPage from "@/app/(console)/audits/page";

function setupResolvedParams() {
  cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
  getTranslationsMock.mockResolvedValue((key: string) => key);
  parseAuditListSearchParamsMock.mockResolvedValue({
    environmentSlug: "dev",
    page: 1,
    pageSize: 10,
  });
  resolveEnvironmentSlugToIdMock.mockResolvedValue({
    environmentId: 3,
    page: 1,
    pageSize: 10,
  });
}

const searchParams = Promise.resolve({ environment: "dev" });

describe("/audits page", () => {
  it("renders a localized forbidden notice when audit reads are denied", async () => {
    setupResolvedParams();
    // WHY: audit reads are admin-only. An editor who reaches the route
    // directly must see the permission boundary, not a false
    // "backend unreachable" boundary.
    listAuditEventViewModelsMock.mockRejectedValue(
      new ApiError(403, "admin role is required", undefined, "forbidden"),
    );

    render(await AuditsPage({ searchParams }));

    expect(screen.getByText("errors.forbidden")).toBeInTheDocument();
  });

  it("rethrows non-403 failures to the error boundary", async () => {
    setupResolvedParams();
    // WHY: only the admin-only boundary is downgraded to a notice; real
    // backend failures still surface through the shared error path.
    listAuditEventViewModelsMock.mockRejectedValue(
      new ApiError(503, "upstream unavailable"),
    );

    await expect(AuditsPage({ searchParams })).rejects.toMatchObject({
      status: 503,
    });
  });
});
