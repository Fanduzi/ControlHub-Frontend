// input: QueryDisclosureSettings, mocked query services and trusted-role seam
// output: component tests for disclosure-policy administration and non-admin denial
// pos: presentation-level coverage for query disclosure settings
// note: if this file changes, update this header and tests/components/README.md
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ isAdmin: true }));

vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => auth.isAdmin,
}));

vi.mock("@/services/query-disclosure", () => ({
  listDisclosurePolicies: vi.fn(),
  createDisclosurePolicy: vi.fn(),
  updateDisclosurePolicy: vi.fn(),
  deleteDisclosurePolicy: vi.fn(),
}));

vi.mock("@/services/query-targets", () => ({
  getQueryTargets: vi.fn(),
}));

import {
  listDisclosurePolicies,
  createDisclosurePolicy,
  updateDisclosurePolicy,
  deleteDisclosurePolicy,
} from "@/services/query-disclosure";
import { getQueryTargets } from "@/services/query-targets";
import { QueryDisclosureSettings } from "@/components/settings/query-disclosure-settings";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";
import type { DisclosurePolicy } from "@/types/query-disclosure";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

const mockListDisclosurePolicies = vi.mocked(listDisclosurePolicies);
const mockCreateDisclosurePolicy = vi.mocked(createDisclosurePolicy);
const mockUpdateDisclosurePolicy = vi.mocked(updateDisclosurePolicy);
const mockDeleteDisclosurePolicy = vi.mocked(deleteDisclosurePolicy);
const mockGetQueryTargets = vi.mocked(getQueryTargets);

function buildTargets(): QueryTarget[] {
  return [
    buildQueryTarget({
      resourceId: 42,
      displayName: "Order MySQL Instance",
      resourceName: "order-mysql",
      connectionContext: {
        engine: "mysql",
        host: "order-db.internal",
        port: 3306,
        environment: "Production",
        owner: "DBA Team",
        clusterName: "Order MySQL Cluster",
      },
    }),
    buildQueryTarget({
      resourceId: 43,
      displayName: "Payment MySQL Instance",
      resourceName: "payment-mysql",
      connectionContext: {
        engine: "mysql",
        host: "payment-db.internal",
        port: 3306,
        environment: "Staging",
        owner: "Payments",
        clusterName: "",
      },
    }),
  ];
}

function buildPolicy(
  overrides: Partial<DisclosurePolicy> = {},
): DisclosurePolicy {
  return {
    id: 1,
    targetResourceId: 42,
    databaseName: "production",
    objectName: "users",
    columnName: "email",
    mode: "masked_no_copy",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderSettings(
  targets: QueryTarget[] = buildTargets(),
  messages: Record<string, unknown> = enMessages,
  options: {
    environmentId?: number;
    locale?: string;
    pageInfo?: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  } = {},
) {
  return render(
    <NextIntlClientProvider locale={options.locale ?? "en"} messages={messages}>
      <QueryDisclosureSettings
        targets={targets}
        environmentId={options.environmentId}
        pageInfo={options.pageInfo ?? {
          page: 1,
          pageSize: 25,
          totalItems: targets.length,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        }}
      />
    </NextIntlClientProvider>,
  );
}

describe("QueryDisclosureSettings admin gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAdmin = true;
  });

  afterEach(() => {
    auth.isAdmin = true;
    window.sessionStorage.clear();
  });

  it("shows non-admin message for viewer role", async () => {
    auth.isAdmin = false;

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders admin UI for admin users", async () => {
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockListDisclosurePolicies.mockResolvedValue({ items: [] });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Add Policy")).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/managed by administrators/i),
    ).toBeNull();
  });

  it("never calls API for non-admin users", async () => {
    auth.isAdmin = false;

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(mockListDisclosurePolicies).not.toHaveBeenCalled();
    expect(mockCreateDisclosurePolicy).not.toHaveBeenCalled();
    expect(mockUpdateDisclosurePolicy).not.toHaveBeenCalled();
    expect(mockDeleteDisclosurePolicy).not.toHaveBeenCalled();
  });
});

describe("QueryDisclosureSettings policy list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("displays policies in a table", async () => {
    mockListDisclosurePolicies.mockResolvedValue({
      items: [
        buildPolicy({ databaseName: "production", objectName: "users", columnName: "email", mode: "masked_no_copy" }),
        buildPolicy({ id: 2, databaseName: "analytics", objectName: "orders", columnName: "amount", mode: "raw_copy_allowed" }),
      ],
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });

    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
    expect(screen.getByText("amount")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("analytics")).toBeInTheDocument();
  });

  it("shows empty state when no policies exist", async () => {
    mockListDisclosurePolicies.mockResolvedValue({ items: [] });

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/no disclosure policies configured/i),
      ).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    mockListDisclosurePolicies.mockRejectedValue(new Error("Network error"));

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Unable to load disclosure policies.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Network error")).toBeNull();
  });

  it("localizes the target and policy field placeholders in Chinese", async () => {
    const user = userEvent.setup();

    mockListDisclosurePolicies.mockResolvedValue({ items: [] });
    renderSettings(buildTargets(), zhMessages, { locale: "zh-CN" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新增策略" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "新增策略" }));

    expect(screen.getByPlaceholderText("例如 production")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例如 users")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例如 email")).toBeInTheDocument();
  });

  it("localizes the actions column label in Chinese", async () => {
    mockListDisclosurePolicies.mockResolvedValue({ items: [buildPolicy()] });

    renderSettings(buildTargets(), zhMessages, { locale: "zh-CN" });

    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });
    expect(screen.getByText("操作")).toBeInTheDocument();
  });
});

describe("QueryDisclosureSettings create dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockListDisclosurePolicies.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("opens create dialog when clicking Add Policy", async () => {
    const user = userEvent.setup();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add policy/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add policy/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/e\.g\. production/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. users/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. email/i)).toBeInTheDocument();
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
  });

  it("validates required fields before submission", async () => {
    const user = userEvent.setup();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add policy/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add policy/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const submitButton = within(dialog).getByRole("button", { name: /add policy/i });
    expect(submitButton).toBeDisabled();
  });

  it("mode selector shows only raw_copy_allowed and masked_no_copy", async () => {
    const user = userEvent.setup();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add policy/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add policy/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const modeTrigger = dialog.querySelector("[data-slot='select-trigger']:last-of-type") as HTMLElement;
    expect(modeTrigger).not.toBeNull();
    await user.click(modeTrigger);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /raw.*copy allowed/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /masked.*no copy/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole("option", { name: /blocked/i })).toBeNull();
  });

  it("calls createDisclosurePolicy on valid submission", async () => {
    const user = userEvent.setup();
    mockCreateDisclosurePolicy.mockResolvedValue(buildPolicy());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add policy/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add policy/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/e\.g\. production/i), "production");
    await user.type(screen.getByPlaceholderText(/e\.g\. users/i), "users");
    await user.type(screen.getByPlaceholderText(/e\.g\. email/i), "email");

    const dialog = screen.getByRole("dialog");
    const submitButton = within(dialog).getByRole("button", { name: /add policy/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateDisclosurePolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseName: "production",
          objectName: "users",
          columnName: "email",
          mode: "raw_copy_allowed",
        }),
      );
    });
  });

  it("uses safe localized copy when saving fails", async () => {
    const user = userEvent.setup();
    mockCreateDisclosurePolicy.mockRejectedValue(new Error("backend secret"));

    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add policy/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add policy/i }));
    await user.type(screen.getByPlaceholderText(/e\.g\. production/i), "production");
    await user.type(screen.getByPlaceholderText(/e\.g\. users/i), "users");
    await user.type(screen.getByPlaceholderText(/e\.g\. email/i), "email");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /add policy/i }));

    await waitFor(() => {
      expect(screen.getByText("Unable to save disclosure policy.")).toBeInTheDocument();
    });
    expect(screen.queryByText("backend secret")).toBeNull();
  });
});

describe("QueryDisclosureSettings delete confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockListDisclosurePolicies.mockResolvedValue({
      items: [buildPolicy()],
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("shows delete confirmation dialog when clicking delete", async () => {
    const user = userEvent.setup();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole("button", { name: /delete policy/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    expect(screen.getByText("production.users.email")).toBeInTheDocument();
  });

  it("calls deleteDisclosurePolicy on confirm", async () => {
    const user = userEvent.setup();
    mockDeleteDisclosurePolicy.mockResolvedValue(undefined);

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole("button", { name: /delete policy/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole("button", { name: /delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockDeleteDisclosurePolicy).toHaveBeenCalledWith({
        targetResourceId: 42,
        databaseName: "production",
        objectName: "users",
        columnName: "email",
      });
    });
  });

  it("shows success feedback after deletion", async () => {
    const user = userEvent.setup();
    mockDeleteDisclosurePolicy.mockResolvedValue(undefined);

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole("button", { name: /delete policy/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole("button", { name: /delete$/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/disclosure policy deleted/i)).toBeInTheDocument();
    });
  });

  it("uses safe localized copy when deletion fails", async () => {
    const user = userEvent.setup();
    mockDeleteDisclosurePolicy.mockRejectedValue(new Error("delete secret"));

    renderSettings();
    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /delete policy/i }));
    await user.click(screen.getByRole("button", { name: /delete$/i }));

    await waitFor(() => {
      expect(screen.getByText("Unable to delete disclosure policy.")).toBeInTheDocument();
    });
    expect(screen.queryByText("delete secret")).toBeNull();
  });
});

describe("QueryDisclosureSettings edit dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockListDisclosurePolicies.mockResolvedValue({
      items: [buildPolicy()],
    });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("opens edit dialog pre-filled with policy data", async () => {
    const user = userEvent.setup();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });

    const editButton = screen.getByRole("button", { name: /edit policy/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/e\.g\. production/i)).toHaveValue("production");
    expect(screen.getByPlaceholderText(/e\.g\. users/i)).toHaveValue("users");
    expect(screen.getByPlaceholderText(/e\.g\. email/i)).toHaveValue("email");
  });

  it("calls updateDisclosurePolicy on edit submission", async () => {
    const user = userEvent.setup();
    mockUpdateDisclosurePolicy.mockResolvedValue(
      buildPolicy({ mode: "raw_copy_allowed" }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });

    const editButton = screen.getByRole("button", { name: /edit policy/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog");
    const modeTrigger = dialog.querySelector("[data-slot='select-trigger']:last-of-type") as HTMLElement;
    expect(modeTrigger).not.toBeNull();
    await user.click(modeTrigger);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /raw.*copy allowed/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /raw.*copy allowed/i }));

    const saveButton = within(dialog).getByRole("button", { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateDisclosurePolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "raw_copy_allowed",
        }),
      );
    });
  });
});

describe("QueryDisclosureSettings target switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("fetches policies for the selected target", async () => {
    mockListDisclosurePolicies.mockResolvedValue({ items: [] });

    renderSettings();

    await waitFor(() => {
      expect(mockListDisclosurePolicies).toHaveBeenCalledWith(42);
    });

    expect(mockListDisclosurePolicies).toHaveBeenCalledTimes(1);
  });

  it("fetches policies when switching targets", async () => {
    const user = userEvent.setup();
    mockListDisclosurePolicies.mockResolvedValue({ items: [] });

    renderSettings();

    await waitFor(() => {
      expect(mockListDisclosurePolicies).toHaveBeenCalledWith(42);
    });

    const targetSelect = screen.getByLabelText(/target/i);
    await user.click(targetSelect);

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "Payment MySQL Instance" }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: "Payment MySQL Instance" }),
    );

    await waitFor(() => {
      expect(mockListDisclosurePolicies).toHaveBeenCalledWith(43);
    });
  });

  it("loads the next scoped target page so a target after the initial 25 is selectable", async () => {
    const user = userEvent.setup();
    const laterTarget = buildQueryTarget({
      resourceId: 99,
      displayName: "Later PostgreSQL Instance",
      resourceName: "later-postgres",
    });
    mockListDisclosurePolicies.mockResolvedValue({ items: [] });
    mockGetQueryTargets.mockResolvedValue({
      items: [laterTarget],
      pageInfo: {
        page: 2,
        pageSize: 25,
        totalItems: 26,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });

    renderSettings([buildTargets()[0]!], enMessages, {
      environmentId: 7,
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 26,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });

    await user.click(screen.getByRole("button", { name: "Next targets" }));

    await waitFor(() => {
      expect(mockGetQueryTargets).toHaveBeenCalledWith({
        page: 2,
        pageSize: 25,
        environmentId: 7,
      });
    });
    await user.click(await screen.findByLabelText("Target"));
    await user.click(await screen.findByRole("option", { name: "Later PostgreSQL Instance" }));

    await waitFor(() => {
      expect(mockListDisclosurePolicies).toHaveBeenCalledWith(99);
    });
  });

  it("reports a target page failure without exposing stale pagination as success", async () => {
    const user = userEvent.setup();
    mockListDisclosurePolicies.mockResolvedValue({ items: [] });
    mockGetQueryTargets.mockRejectedValue(new Error("network"));

    renderSettings([buildTargets()[0]!], enMessages, {
      environmentId: 7,
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 26,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });
    await user.click(screen.getByRole("button", { name: "Next targets" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load targets.");
  });
});
