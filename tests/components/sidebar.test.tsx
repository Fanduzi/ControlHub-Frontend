import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/app-shell/sidebar";
import messages from "@/messages/en.json";

const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

let currentEnvironmentId = "";

vi.mock("@/components/providers/environment-provider", () => ({
  useEnvironment: () => ({
    currentEnvironmentId,
  }),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    currentEnvironmentId = "";
    searchParams.delete("environmentId");
  });

  it("renders the console navigation groups in the agreed order", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/overview",
    );
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "href",
      "/resources",
    );
    expect(screen.getByRole("link", { name: "CMDB" })).toHaveAttribute(
      "href",
      "/cmdb",
    );
    expect(screen.getByRole("link", { name: "Databases" })).toHaveAttribute(
      "href",
      "/databases",
    );
    expect(screen.getByRole("link", { name: "Audits" })).toHaveAttribute(
      "href",
      "/audits",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("marks the active route for the current console section", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("preserves environmentId only on pages that support environment-scoped URLs", () => {
    searchParams.set("environmentId", "env-prod");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/overview?environmentId=env-prod",
    );
    expect(screen.getByRole("link", { name: "Databases" })).toHaveAttribute(
      "href",
      "/databases?environmentId=env-prod",
    );
    expect(screen.getByRole("link", { name: "Audits" })).toHaveAttribute(
      "href",
      "/audits",
    );
  });

  it("falls back to provider environment context when the URL is not environment-scoped", () => {
    currentEnvironmentId = "env-prod";

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/audits" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/overview?environmentId=env-prod",
    );
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "href",
      "/resources?environmentId=env-prod",
    );
    expect(screen.getByRole("link", { name: "Audits" })).toHaveAttribute(
      "href",
      "/audits",
    );
  });
});
