// input: @/components/app-shell/topbar, next-intl, next/navigation, environment/theme providers
// output: Vitest tests for the console topbar (environment switching, URL params, server-confirmed fail-closed sign-out)
// pos: unit contract tests for shell chrome behavior incl. BFF logout failure handling
// note: if this file changes, update header and tests/components/README.md
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
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
    searchParams.delete("engine");
    searchParams.delete("pageSize");
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
    expect(replace).toHaveBeenCalledOnce();
  });

  it("scopes Query with the normal selector while preserving its filters", async () => {
    const user = userEvent.setup();
    searchParams.set("engine", "mysql");
    searchParams.set("pageSize", "50");

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/query" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Production" }));

    expect(replace).toHaveBeenCalledWith(
      "/query?page=1&q=orders&engine=mysql&pageSize=50&environment=prod",
    );
  });

  it("scopes query disclosure policies with the normal selector", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Topbar pathname="/settings/query-disclosure-policies" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Production" }));

    expect(replace).toHaveBeenCalledWith(
      "/settings/query-disclosure-policies?page=1&q=orders&environment=prod",
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

  describe("sign-out", () => {
    const locationMock = { href: "http://localhost:3100/overview" };
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      Object.defineProperty(window, "location", {
        configurable: true,
        value: locationMock,
      });
      window.sessionStorage.clear();
      document.cookie.split(";").forEach((cookie) => {
        const name = cookie.split("=")[0]?.trim();
        if (name) document.cookie = `${name}=; path=/; max-age=0`;
      });
      locationMock.href = "http://localhost:3100/overview";
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function openMenuAndClickSignOut(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: /CH/ }));
      await user.click(await screen.findByRole("menuitem", { name: /sign out/i }));
    }

    it("leaves the console only after the BFF logout succeeded (session cleared server-side)", async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      window.sessionStorage.setItem("controlhub.role", "admin");
      document.cookie = "controlhub.role=admin; path=/";

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <Topbar pathname="/overview" />
        </NextIntlClientProvider>,
      );

      await openMenuAndClickSignOut(user);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/operator-session", {
          method: "DELETE",
          cache: "no-store",
        });
        expect(locationMock.href).toBe("/login");
      });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("fails closed on network failure: stays in the console and never presents a logged-out state", async () => {
      const user = userEvent.setup();
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      window.sessionStorage.setItem("controlhub.role", "admin");
      document.cookie = "controlhub.role=admin; path=/";

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <Topbar pathname="/overview" />
        </NextIntlClientProvider>,
      );

      await openMenuAndClickSignOut(user);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeTruthy();
      });
      expect(locationMock.href).toBe("http://localhost:3100/overview");
      expect(window.sessionStorage.getItem("controlhub.role")).toBe("admin");
      expect(document.cookie).toContain("controlhub.role=admin");
    });

    it("fails closed when the backend rejects logout (non-2xx): stays in the console with the session intact", async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValue({ ok: false, status: 503 });
      window.sessionStorage.setItem("controlhub.role", "admin");

      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <Topbar pathname="/overview" />
        </NextIntlClientProvider>,
      );

      await openMenuAndClickSignOut(user);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeTruthy();
      });
      expect(locationMock.href).toBe("http://localhost:3100/overview");
      expect(window.sessionStorage.getItem("controlhub.role")).toBe("admin");
    });
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
