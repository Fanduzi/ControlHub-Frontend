import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Topbar } from "@/components/app-shell/topbar";
import messages from "@/messages/en.json";

const replace = vi.fn();
const setEnvironmentId = vi.fn();
const searchParams = new URLSearchParams("page=3&q=orders");
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
    slug: "stage",
    description: "",
    createdAt: "",
  },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/components/providers/environment-provider", () => ({
  useEnvironment: () => ({
    environments,
    currentEnvironmentId,
    setEnvironmentId,
    loading: false,
  }),
}));

vi.mock("@/components/settings/language-switcher", () => ({
  LanguageSwitcher: () => <div>language-switcher</div>,
}));

vi.mock("@/components/settings/theme-toggle", () => ({
  ThemeToggle: () => <div>theme-toggle</div>,
}));

vi.mock("@/components/settings/accent-switcher", () => ({
  AccentSwitcher: () => <div>accent-switcher</div>,
}));

describe("Topbar", () => {
  beforeEach(() => {
    replace.mockClear();
    setEnvironmentId.mockClear();
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
        slug: "stage",
        description: "",
        createdAt: "",
      },
    ];
    searchParams.delete("environmentId");
    searchParams.set("page", "3");
    searchParams.set("q", "orders");
  });

  it("updates environmentId in the current URL and resets to the first page", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Production" }));

    expect(setEnvironmentId).toHaveBeenCalledWith("env-prod");
    expect(replace).toHaveBeenCalledWith(
      "/resources?page=1&q=orders&environmentId=env-prod",
    );
  });

  it("prefers environmentId from the URL over provider state for the selected value", () => {
    currentEnvironmentId = "env-stage";
    searchParams.set("environmentId", "env-prod");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Production");
  });

  it("does not append environmentId to unsupported audits URLs", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/audits" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Production" }));

    expect(setEnvironmentId).toHaveBeenCalledWith("env-prod");
    expect(replace).toHaveBeenCalledWith("/audits?page=1&q=orders");
  });

  it("does not emit fallback environment slugs as environmentId values", async () => {
    const user = userEvent.setup();
    environments = [
      {
        id: "10000000-0000-0000-0000-000000000001",
        name: "Production",
        slug: "prod",
        description: "Production environment",
        createdAt: "2026-04-12T12:57:30Z",
      },
      {
        id: "10000000-0000-0000-0000-000000000002",
        name: "Staging",
        slug: "staging",
        description: "Staging environment",
        createdAt: "2026-04-12T12:57:30Z",
      },
    ];
    currentEnvironmentId = "production";

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Production" }));

    expect(setEnvironmentId).toHaveBeenLastCalledWith(
      "10000000-0000-0000-0000-000000000001",
    );
    expect(replace).toHaveBeenLastCalledWith(
      "/resources?page=1&q=orders&environmentId=10000000-0000-0000-0000-000000000001",
    );
  });
});
