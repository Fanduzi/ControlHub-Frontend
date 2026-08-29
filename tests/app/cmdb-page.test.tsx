// input: @testing-library/react, next-intl/server, CMDB route page
// output: regression coverage for the visible /cmdb migration notice
// pos: app route seam test for the retained CMDB bookmark
// note: if this file changes, update this header and tests/app/README.md.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getTranslationsMock } = vi.hoisted(() => ({
  getTranslationsMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: getTranslationsMock,
}));

import CmdbPage from "@/app/(console)/cmdb/page";

describe("/cmdb page", () => {
  it("shows the new Resources location instead of redirecting bookmarked users", async () => {
    const messages: Record<string, string> = {
      "pages.cmdb.eyebrow": "CMDB",
      "pages.cmdb.title": "CMDB is now in Resources",
      "pages.cmdb.description": "The CMDB view moved to the unified resource inventory.",
      "pages.cmdb.message": "CMDB is now available at /resources.",
      "pages.cmdb.openResources": "Open Resources",
    };
    getTranslationsMock.mockResolvedValue((key: string) => messages[key] ?? key);

    render(await CmdbPage());

    expect(
      screen.getByRole("heading", { name: "CMDB is now in Resources" }),
    ).toBeInTheDocument();
    expect(screen.getByText("CMDB is now available at /resources.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Resources" })).toHaveAttribute(
      "href",
      "/resources",
    );
  });
});
