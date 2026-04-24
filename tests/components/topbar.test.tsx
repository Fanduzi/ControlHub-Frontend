import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Topbar } from "@/components/app-shell/topbar";
import messages from "@/messages/en.json";

const replace = vi.fn();
const setEnvironmentId = vi.fn();
const searchParams = new URLSearchParams("page=3&q=orders");
let currentEnvironmentId: number | null = null;
let environments = [
  {
    id: 10000000,
    name: "Production",
    slug: "prod",
    description: "",
    createdAt: "",
  },
  {
    id: 10000001,
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
    currentEnvironmentId = null;
    environments = [
      {
        id: 10000000,
        name: "Production",
        slug: "prod",
        description: "",
        createdAt: "",
      },
      {
        id: 10000001,
        name: "Staging",
        slug: "stage",
        description: "",
        createdAt: "",
      },
    ];
    searchParams.delete("environmentId");
    searchParams.delete("environment");
    searchParams.set("page", "3");
    searchParams.set("q", "orders");
  });

  it("updates environment in the current URL using a readable slug and resets to the first page", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Production" }));

    expect(setEnvironmentId).toHaveBeenCalledWith(10000000);
    expect(replace).toHaveBeenCalledWith(
      "/resources?page=1&q=orders&environment=prod",
    );
  });

  it("prefers readable environment slug from the URL over provider state for the selected value", () => {
    currentEnvironmentId = 10000001;
    searchParams.set("environment", "prod");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Production");
  });

  it("does not fall back to provider environment when URL slug is unknown", () => {
    currentEnvironmentId = 10000001;
    searchParams.set("environment", "missing");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Unknown");
    expect(setEnvironmentId).not.toHaveBeenCalled();
  });

  it("ignores malformed numeric environmentId values from the URL", () => {
    currentEnvironmentId = 10000001;
    searchParams.set("environmentId", "10000000x");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Staging");
    expect(setEnvironmentId).not.toHaveBeenCalled();
  });

  it("ignores unsafe numeric environmentId values from the URL", () => {
    currentEnvironmentId = 10000001;
    searchParams.set("environmentId", "9007199254740992");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Staging");
    expect(setEnvironmentId).not.toHaveBeenCalled();
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

    expect(setEnvironmentId).toHaveBeenCalledWith(10000000);
    expect(replace).toHaveBeenCalledWith("/audits?page=1&q=orders");
  });

  it("does not emit raw ids in readable environment URLs when a backend slug exists", async () => {
    const user = userEvent.setup();
    environments = [
      {
        id: 10000000,
        name: "Production",
        slug: "prod",
        description: "Production environment",
        createdAt: "2026-04-12T12:57:30Z",
      },
      {
        id: 10000001,
        name: "Staging",
        slug: "staging",
        description: "Staging environment",
        createdAt: "2026-04-12T12:57:30Z",
      },
    ];
    currentEnvironmentId = 10000001;

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/resources" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Production" }));

    expect(setEnvironmentId).toHaveBeenLastCalledWith(
      10000000,
    );
    expect(replace).toHaveBeenLastCalledWith(
      "/resources?page=1&q=orders&environment=prod",
    );
  });
});
