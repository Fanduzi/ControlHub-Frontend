// input: vitest, testing-library, sidebar, auth-role
// output: sidebar tests — navigation, environment scoping, admin-only audits entry
// pos: component tests for console navigation chrome
// note: if this file changes, update header and tests/components/README.md
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/app-shell/sidebar";
import messages from "@/messages/en.json";

let isAdmin = true;
vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));

const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

let currentEnvironmentId = "";
let environments = [
  {
    id: "env-prod",
    name: "Production",
    slug: "prod",
    description: "",
    createdAt: "",
  },
  {
    id: "env-stage",
    name: "Staging",
    slug: "staging",
    description: "",
    createdAt: "",
  },
];

vi.mock("@/components/providers/environment-provider", () => ({
  useEnvironment: () => ({
    environments,
    currentEnvironmentId,
  }),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    isAdmin = true;
    currentEnvironmentId = "";
    environments = [
      {
        id: "env-prod",
        name: "Production",
        slug: "prod",
        description: "",
        createdAt: "",
      },
      {
        id: "env-stage",
        name: "Staging",
        slug: "staging",
        description: "",
        createdAt: "",
      },
    ];
    searchParams.delete("environmentId");
    searchParams.delete("environment");
  });

  it("hides the admin-only audits navigation for non-admin operators", () => {
    isAdmin = false;

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole("link", { name: "Audits" })).toBeNull();
    expect(screen.getByRole("link", { name: "Resources" })).toBeInTheDocument();
  });

  it("shows the audits navigation for administrators", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Audits" })).toBeInTheDocument();
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

  it("preserves environment scope only on pages that support environment-scoped URLs", () => {
    searchParams.set("environment", "prod");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/overview?environment=prod",
    );
    expect(screen.getByRole("link", { name: "Databases" })).toHaveAttribute(
      "href",
      "/databases?environment=prod",
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
      "/overview?environment=prod",
    );
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "href",
      "/resources?environment=prod",
    );
    expect(screen.getByRole("link", { name: "Audits" })).toHaveAttribute(
      "href",
      "/audits",
    );
  });

  it("prefers readable environment slug links over raw ids for environment-scoped navigation", () => {
    searchParams.set("environment", "staging");
    searchParams.set("environmentId", "env-stage");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/overview?environment=staging",
    );
    expect(screen.getByRole("link", { name: "Databases" })).toHaveAttribute(
      "href",
      "/databases?environment=staging",
    );
    expect(screen.getByRole("link", { name: "Audits" })).toHaveAttribute(
      "href",
      "/audits",
    );
  });

  it("falls back to the known environment slug when the URL slug is invalid", () => {
    searchParams.set("environment", "unknown");
    currentEnvironmentId = "env-stage";

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/overview?environment=staging",
    );
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "href",
      "/resources?environment=staging",
    );
  });

  it("keeps the collapse control sticky and self-describing when expanded", async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar
          pathname="/resources"
          collapsed={false}
          onToggleCollapse={onToggleCollapse}
        />
      </NextIntlClientProvider>,
    );

    const collapseControl = screen.getByRole("button", {
      name: "Collapse sidebar",
    });

    expect(collapseControl).toHaveTextContent("Collapse sidebar");
    expect(collapseControl.closest("div")).toHaveAttribute(
      "data-sidebar-collapse-control",
      "sticky",
    );

    await user.click(collapseControl);

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("renders the collapsed expand control without nesting button elements", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar
          pathname="/resources"
          collapsed
          onToggleCollapse={() => undefined}
        />
      </NextIntlClientProvider>,
    );

    expect(container.querySelector("button button")).toBeNull();
  });

  it("keeps the collapsed control icon-only with an accessible tooltip label", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar
          pathname="/resources"
          collapsed
          onToggleCollapse={() => undefined}
        />
      </NextIntlClientProvider>,
    );

    const expandControl = screen.getByRole("button", {
      name: "Expand sidebar",
    });

    expect(expandControl).not.toHaveTextContent("Expand sidebar");
    expect(expandControl.closest("div")).toHaveAttribute(
      "data-sidebar-collapse-control",
      "sticky",
    );

    await user.hover(expandControl);

    expect(await screen.findByText("Expand sidebar")).toBeInTheDocument();
  });

  it("does not present CMDB as a competing inventory model", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    const links = screen.getAllByRole("link");
    const linkTexts = links.map((link) => link.textContent);
    expect(linkTexts).not.toContain("CMDB");

    expect(screen.queryByRole("link", { name: /cmdb/i })).toBeNull();
  });

  it("presents Resources as the canonical inventory entry", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Sidebar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    const resourcesLink = screen.getByRole("link", { name: "Resources" });
    expect(resourcesLink).toHaveAttribute("href", "/resources");
  });
});
