import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/query-credentials", async () => {
  const actual = await vi.importActual("@/services/query-credentials");
  return {
    ...actual,
    getQueryCredential: vi.fn(),
    saveQueryCredential: vi.fn(),
    deleteQueryCredential: vi.fn(),
  };
});

vi.mock("@/services/query-targets", () => ({
  getQueryTargets: vi.fn(),
}));

import {
  deleteQueryCredential,
  getQueryCredential,
  saveQueryCredential,
} from "@/services/query-credentials";
import { getQueryTargets } from "@/services/query-targets";
import { QueryCredentialSettings } from "@/components/settings/query-credential-settings";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import type {
  QueryCredentialStatusResponse,
  QueryCredentialUpsertRequest,
} from "@/types/query-credential";
import enMessages from "@/messages/en.json";

const mockGetQueryCredential = vi.mocked(getQueryCredential);
const mockSaveQueryCredential = vi.mocked(saveQueryCredential);
const mockDeleteQueryCredential = vi.mocked(deleteQueryCredential);
const mockGetQueryTargets = vi.mocked(getQueryTargets);

function pageInfoFor(targets: QueryTarget[], totalItems = targets.length): PageInfo {
  return {
    page: 1,
    pageSize: 25,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / 25)),
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

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

function credentialResponse(
  overrides: Partial<QueryCredentialStatusResponse> = {},
): QueryCredentialStatusResponse {
  return {
    resourceId: 42,
    configured: false,
    engine: "mysql",
    credentialRef: "",
    enabled: false,
    environmentPolicy: "disabled",
    runtimeStatus: "missing_metadata",
    executionEligible: false,
    message: "No read-only credential reference is configured.",
    ...overrides,
  };
}

function renderSettings(
  targets: QueryTarget[] = buildTargets(),
  pageInfo: PageInfo = pageInfoFor(targets),
  messages: Record<string, unknown> = enMessages,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryCredentialSettings targets={targets} pageInfo={pageInfo} />
    </NextIntlClientProvider>,
  );
}

function requireElement<T extends HTMLElement>(
  element: T | null | undefined,
  message: string,
): T {
  if (!element) {
    throw new Error(message);
  }
  return element;
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason: Error) => void;
} {
  let resolve: (value: T | PromiseLike<T>) => void = () => {
    throw new Error("Deferred resolve called before initialization");
  };
  let reject: (reason: Error) => void = () => {
    throw new Error("Deferred reject called before initialization");
  };
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("QueryCredentialSettings admin gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("does not leak admin UI to non-admin users (hydration-safe gate)", async () => {
    // This test verifies the core hydration-safety guarantee: the admin gate
    // never shows admin UI to a non-admin user. The component uses
    // useState(null) + useEffect to read sessionStorage after hydration,
    // ensuring SSR and client first render both produce the loading skeleton.
    // In the test environment (jsdom + act()), effects fire synchronously,
    // so we verify the end-state behavior: non-admin never sees admin UI.
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    // No management UI elements should ever be visible.
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText("Order MySQL Instance")).toBeNull();
    expect(screen.queryByText("Payment MySQL Instance")).toBeNull();
    expect(screen.queryByLabelText(/server secret reference/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders the restricted view when no role is stored", async () => {
    renderSettings();

    // First: loading skeleton
    await waitFor(() => {
      // After effect fires with null role → isAdmin=false → restricted view.
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("renders the full management UI for admin users", async () => {
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    // After role resolution, the filter search box should appear.
    await waitFor(() => {
      expect(
        screen.getByRole("searchbox", {
          name: /search target, host, or environment/i,
        }),
      ).toBeInTheDocument();
    });

    // Target list should be rendered.
    expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    expect(screen.getByText("Payment MySQL Instance")).toBeInTheDocument();

    // No "managed by administrators" message for admin.
    expect(
      screen.queryByText(/managed by administrators/i),
    ).toBeNull();
  });

  it("renders the restricted view for non-admin users", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    // No management UI elements.
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText("Order MySQL Instance")).toBeNull();
    expect(screen.queryByText("Payment MySQL Instance")).toBeNull();
  });

  it("renders the restricted view when no role is stored", async () => {
    window.sessionStorage.removeItem("controlhub.role");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("never calls getQueryCredential for non-admin users", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    // Wait a tick to ensure no lazy effect fires.
    await new Promise((r) => setTimeout(r, 50));

    expect(mockGetQueryCredential).not.toHaveBeenCalled();
    expect(mockSaveQueryCredential).not.toHaveBeenCalled();
    expect(mockDeleteQueryCredential).not.toHaveBeenCalled();
  });

  it("never shows credential input, enabled checkbox, policy select, or action buttons for non-admin", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    // No credential form elements.
    expect(screen.queryByLabelText(/server secret reference/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    // No action buttons.
    expect(screen.queryByRole("button", { name: /save|configure|edit|remove|delete/i })).toBeNull();
  });

  it("shows contact administrator text for non-admin users", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/Contact administrator/i),
      ).toBeInTheDocument();
    });
  });
});

describe("QueryCredentialSettings admin gate — selecting a target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("shows the credential detail panel when admin selects a target", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    // Wait for the target list to render.
    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Click the first target.
    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(mockGetQueryCredential).toHaveBeenCalledWith(42);
  });
});

describe("QueryCredentialSettings stale target guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("does not display target A's credentialRef after switching to target B", async () => {
    const user = userEvent.setup();

    const loadARequests: ReturnType<
      typeof createDeferred<QueryCredentialStatusResponse>
    >[] = [];
    mockGetQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        const request = createDeferred<QueryCredentialStatusResponse>();
        loadARequests.push(request);
        return request.promise;
      }
      // Target B loads immediately.
      return Promise.resolve(
        credentialResponse({
          resourceId: 43,
          credentialRef: "",
          runtimeStatus: "missing_metadata",
        }),
      );
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select target A — its load hangs.
    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await user.click(screen.getByText("Payment MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    requireValue(
      loadARequests.at(-1),
      "Expected a pending target A credential load",
    ).resolve(
      credentialResponse({
        resourceId: 42,
        credentialRef: "ORDER_MYSQL_RO",
        configured: true,
        runtimeStatus: "secret_resolved",
      }),
    );

    await new Promise((r) => setTimeout(r, 50));

    const input = screen.getByLabelText(/server secret reference/i) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.queryByText("ORDER_MYSQL_RO")).toBeNull();
  });

  it("does not display target A's save error after switching to target B", async () => {
    const user = userEvent.setup();
    const saveA = createDeferred<never>();

    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "EXISTING_REF",
        runtimeStatus: "secret_resolved",
      }),
    );
    mockSaveQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        return saveA.promise;
      }
      return Promise.resolve(credentialResponse({ resourceId: 43 }));
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select target A and wait for its credential to load.
    await user.click(screen.getByText("Order MySQL Instance"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Fill in and save for target A.
    const input = screen.getByLabelText(/server secret reference/i);
    await user.clear(input);
    await user.type(input, "NEW_REF");

    const saveButton = screen.getByRole("button", {
      name: /save credential metadata/i,
    });
    await user.click(saveButton);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await user.click(screen.getByText("Payment MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    saveA.reject(new Error("save failed for A"));

    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText("save failed for A")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not display target A's delete result after switching to target B", async () => {
    const user = userEvent.setup();
    const deleteA = createDeferred<void>();

    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "EXISTING_REF",
        runtimeStatus: "secret_resolved",
      }),
    );
    mockDeleteQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        return deleteA.promise;
      }
      return Promise.resolve();
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select target A.
    await user.click(screen.getByText("Order MySQL Instance"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Click remove button.
    const removeButton = screen.getByRole("button", {
      name: /remove credential metadata/i,
    });
    await user.click(removeButton);

    // Confirm deletion.
    const confirmButton = screen.getByRole("button", {
      name: /remove credential metadata\?/i,
    });
    await user.click(confirmButton);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await user.click(screen.getByText("Payment MySQL Instance"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    deleteA.resolve(undefined);

    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("QueryCredentialSettings — detail save feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("shows save feedback and refreshes the operations row after saving a target credential", async () => {
    const user = userEvent.setup();
    let target42Reads = 0;

    mockGetQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        target42Reads += 1;
        if (target42Reads === 1) {
          return Promise.resolve(credentialResponse({ resourceId: 42 }));
        }
        if (target42Reads === 2) {
          return Promise.resolve(
            credentialResponse({
              resourceId: 42,
              configured: true,
              credentialRef: "ORDER_OLD_RO",
              enabled: true,
              environmentPolicy: "non_prod_only",
              runtimeStatus: "secret_missing",
            }),
          );
        }
        return Promise.resolve(
          credentialResponse({
            resourceId: 42,
            configured: true,
            credentialRef: "ORDER_NEW_RO",
            enabled: true,
            environmentPolicy: "non_prod_only",
            runtimeStatus: "secret_resolved",
            executionEligible: true,
          }),
        );
      }

      return Promise.resolve(
        credentialResponse({
          resourceId: targetId,
          configured: false,
          credentialRef: "",
        }),
      );
    });

    mockSaveQueryCredential.mockResolvedValue(
      credentialResponse({
        resourceId: 42,
        configured: true,
        credentialRef: "ORDER_NEW_RO",
        enabled: true,
        environmentPolicy: "non_prod_only",
        runtimeStatus: "secret_resolved",
        executionEligible: true,
      }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    const input = await screen.findByLabelText(/server secret reference/i);
    await waitFor(() => {
      expect(input).toHaveValue("ORDER_OLD_RO");
    });

    await user.clear(input);
    await user.type(input, "ORDER_NEW_RO");

    await user.click(
      screen.getByRole("button", { name: /save credential metadata/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Credential metadata saved."),
      ).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await waitFor(() => {
      const orderRow = screen
        .getAllByRole("row")
        .find((row) =>
          within(row).queryByText("Order MySQL Instance"),
        );
      expect(
        within(
          requireElement(orderRow, "Expected Order MySQL row after save"),
        ).getByText("ORDER_NEW_RO"),
      ).toBeInTheDocument();
    });
  });
});

describe("QueryCredentialSettings — disabled environmentPolicy response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("falls back to non_prod_only when backend returns environmentPolicy disabled", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        environmentPolicy: "disabled",
        credentialRef: "",
      }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // The select trigger should show the non_prod_only label, not "disabled".
    const policySelect = screen.getByRole("combobox", {
      name: /environment policy/i,
    });
    expect(policySelect).toHaveTextContent("Non-production only");
    // The raw "disabled" value must never appear in the policy select.
    expect(policySelect).not.toHaveTextContent("disabled");
    expect(policySelect).not.toHaveTextContent("Disabled");
  });

  it("does not render disabled as the selected policy label", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({ environmentPolicy: "disabled" }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // The policy select trigger should show the fallback "Non-production only",
    // never the raw "disabled" value.
    const policySelect = screen.getByRole("combobox", {
      name: /environment policy/i,
    });
    expect(policySelect).toHaveTextContent("Non-production only");
    expect(policySelect).not.toHaveTextContent("disabled");
    expect(policySelect).not.toHaveTextContent("Disabled");

    // The form should be functional — "All environments" should be selectable.
    // Verify the save button is present (admin UI is fully rendered).
    expect(
      screen.getByRole("button", { name: /save credential metadata/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 38B: Coverage summary cards
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — coverage summary cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("renders coverage summary cards for admin users", async () => {
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Coverage overview")).toBeInTheDocument();
    });

    // Summary card labels should be visible.
    expect(screen.getByText("Total targets")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Missing metadata")).toBeInTheDocument();
    expect(screen.getByText("Secret missing")).toBeInTheDocument();
    expect(screen.getByText("Binding mismatch")).toBeInTheDocument();
    expect(screen.getByText("Policy blocked")).toBeInTheDocument();
    // "Disabled" appears in multiple places (card, filter, table) — check count.
    expect(screen.getAllByText("Disabled").length).toBeGreaterThanOrEqual(1);
  });

  it("shows total count matching the number of targets", async () => {
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Total targets")).toBeInTheDocument();
    });

    // Total should be 2 (the number of targets in buildTargets()).
    // The number appears in the coverage card next to "Total targets".
    const totalLabel = screen.getByText("Total targets");
    const card = totalLabel.closest("div");
    expect(card).toHaveTextContent("2");
  });
});

// ---------------------------------------------------------------------------
// Phase 38B: Credential status fan-out
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — credential status fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("fetches credential status for all targets on mount", async () => {
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(mockGetQueryCredential).toHaveBeenCalled();
    });

    // Should have been called for both targets.
    expect(mockGetQueryCredential).toHaveBeenCalledWith(42);
    expect(mockGetQueryCredential).toHaveBeenCalledWith(43);
  });

  it("shows per-row fetch error badge when credential fetch fails", async () => {
    mockGetQueryCredential.mockRejectedValue(new Error("Network error"));

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Wait for the fetch to complete and error badges to appear.
    await waitFor(() => {
      expect(screen.getAllByText("Fetch error").length).toBeGreaterThan(0);
    });
  });

  it("shows retry button for failed credential fetches", async () => {
    mockGetQueryCredential.mockRejectedValue(new Error("Network error"));

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Wait for error badges.
    await waitFor(() => {
      expect(screen.getAllByText("Retry").length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 38B: Non-admin never sees management controls
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — Phase 38B non-admin boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("never shows coverage summary for non-admin", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Coverage overview")).toBeNull();
    expect(screen.queryByText("Total targets")).toBeNull();
  });

  it("never shows operations table for non-admin", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Credential operations")).toBeNull();
    expect(screen.queryByText("Apply metadata")).toBeNull();
    expect(screen.queryByText("Remove metadata")).toBeNull();
  });

  it("never shows filter controls for non-admin", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/managed by administrators/i),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Filters")).toBeNull();
    expect(screen.queryByText("Group by")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 38B: Bulk apply request body whitelist
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — bulk apply request body", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("sends only whitelisted fields in bulk apply", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());
    mockSaveQueryCredential.mockResolvedValue(
      credentialResponse({ runtimeStatus: "secret_resolved" }),
    );

    renderSettings();

    // Wait for targets to render.
    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all targets via the header checkbox.
    const checkboxes = screen.getAllByRole("checkbox");
    const headerCheckbox = checkboxes[0];
    await user.click(headerCheckbox);

    // Click "Apply metadata" button.
    const applyButton = screen.getByRole("button", {
      name: /apply metadata/i,
    });
    await user.click(applyButton);

    // Fill in the bulk apply form.
    const refInput = screen.getByLabelText(/credential reference/i);
    await user.type(refInput, "TEST_REF");

    // Click apply.
    const submitButton = screen.getByRole("button", {
      name: /apply to selected targets/i,
    });
    await user.click(submitButton);

    // Wait for the save calls.
    await waitFor(() => {
      expect(mockSaveQueryCredential).toHaveBeenCalled();
    });

    // Verify the request body only contains allowed fields.
    const calls = mockSaveQueryCredential.mock.calls;
    for (const call of calls) {
      const body = call[1] as QueryCredentialUpsertRequest;
      expect(body).not.toHaveProperty("actorUserId");
      expect(body).not.toHaveProperty("dsn");
      expect(body).not.toHaveProperty("password");
      expect(body).not.toHaveProperty("host");
      expect(body).not.toHaveProperty("port");
      expect(body).not.toHaveProperty("engine");
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 38B: all_environments confirmation
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — bulk apply all_environments confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("disables apply button until all_environments is confirmed", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Click "Apply metadata".
    const applyButton = screen.getByRole("button", {
      name: /apply metadata/i,
    });
    await user.click(applyButton);

    // Fill credential ref.
    const refInput = screen.getByLabelText(/credential reference/i);
    await user.type(refInput, "TEST_REF");

    // The all-environments confirmation checkbox should not be visible yet.
    expect(screen.queryByLabelText(/i understand/i)).toBeNull();

    // Select "All environments" policy using the trigger button.
    const policyTrigger = document.getElementById("bulk-environment-policy");
    expect(policyTrigger).not.toBeNull();
    await user.click(
      requireElement(policyTrigger, "Expected bulk environment policy trigger"),
    );

    // Wait for options to appear and click "All environments".
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /all environments/i }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("option", { name: /all environments/i }),
    );

    // Now the confirmation checkbox should be visible.
    await waitFor(() => {
      expect(screen.getByLabelText(/i understand/i)).toBeInTheDocument();
    });

    // Apply button should be disabled until confirmation.
    const submitButton = screen.getByRole("button", {
      name: /apply to selected targets/i,
    });
    expect(submitButton).toBeDisabled();

    // Confirm all environments.
    const confirmCheckbox = screen.getByLabelText(/i understand/i);
    await user.click(confirmCheckbox);

    // Now the button should be enabled.
    expect(submitButton).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Phase 38B: Bulk partial success/failure display
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — bulk partial results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("shows per-target success and failure results after bulk apply", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    // First target succeeds, second fails.
    mockSaveQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        return Promise.resolve(
          credentialResponse({ runtimeStatus: "secret_resolved" }),
        );
      }
      return Promise.reject(new Error("403 forbidden"));
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Open bulk apply.
    const applyButton = screen.getByRole("button", {
      name: /apply metadata/i,
    });
    await user.click(applyButton);

    // Fill and submit.
    const refInput = screen.getByLabelText(/credential reference/i);
    await user.type(refInput, "TEST_REF");

    const submitButton = screen.getByRole("button", {
      name: /apply to selected targets/i,
    });
    await user.click(submitButton);

    // Wait for results to appear.
    await waitFor(() => {
      expect(screen.getByText(/Some targets failed/)).toBeInTheDocument();
    });

    // Both success and failure counts should be shown.
    expect(screen.getByText(/1 Success/)).toBeInTheDocument();
    expect(screen.getByText(/1 Failed/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 38B: Bulk remove
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — bulk remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("requires confirmation before bulk remove", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Click "Remove metadata".
    const removeButton = screen.getByRole("button", {
      name: /remove metadata/i,
    });
    await user.click(removeButton);

    // The remove confirmation dialog should appear.
    expect(
      screen.getByText("Remove credential metadata"),
    ).toBeInTheDocument();

    // The confirm button should be disabled until the confirmation checkbox is checked.
    const confirmButton = screen.getByRole("button", {
      name: /remove from selected targets/i,
    });
    expect(confirmButton).toBeDisabled();

    // Check the confirmation checkbox.
    const confirmCheckbox = screen.getByRole("checkbox", {
      name: /this removes the credential binding/i,
    });
    await user.click(confirmCheckbox);

    // Now the button should be enabled.
    expect(confirmButton).toBeEnabled();
  });

  it("shows per-target results after bulk remove", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    // First target succeeds, second fails.
    mockDeleteQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("403 forbidden"));
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Open bulk remove.
    const removeButton = screen.getByRole("button", {
      name: /remove metadata/i,
    });
    await user.click(removeButton);

    // Confirm.
    const confirmCheckbox = screen.getByRole("checkbox", {
      name: /this removes the credential binding/i,
    });
    await user.click(confirmCheckbox);

    const submitButton = screen.getByRole("button", {
      name: /remove from selected targets/i,
    });
    await user.click(submitButton);

    // Wait for results.
    await waitFor(() => {
      expect(screen.getByText(/Some targets failed/)).toBeInTheDocument();
    });

    expect(screen.getByText(/1 Success/)).toBeInTheDocument();
    expect(screen.getByText(/1 Failed/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 38B hardening P1: bulk operations scope — only operates on visible
// filtered selectable targets, not all selectedIds
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — bulk operation scope (P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("bulk apply only operates on currently filtered selectable targets", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());
    mockSaveQueryCredential.mockResolvedValue(
      credentialResponse({ runtimeStatus: "secret_resolved" }),
    );

    renderSettings();

    // Wait for targets to render.
    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all targets (both visible).
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Verify 2 selected.
    expect(screen.getByText(/2 selected/)).toBeInTheDocument();

    // Change environment filter to "Production" to hide "Payment MySQL Instance".
    // The environment filter is the first combobox in the filter controls.
    const comboboxes = screen.getAllByRole("combobox");
    const envTrigger = comboboxes[0];
    await user.click(envTrigger);

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "Production" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: "Production" }));

    // After filtering, only 1 target (Order MySQL) should be visible and selected.
    await waitFor(() => {
      expect(screen.getByText(/1 selected/)).toBeInTheDocument();
    });

    // Payment MySQL should not be visible.
    expect(screen.queryByText("Payment MySQL Instance")).toBeNull();

    // Click "Apply metadata".
    const applyButton = screen.getByRole("button", {
      name: /apply metadata/i,
    });
    await user.click(applyButton);

    // Fill credential ref and apply.
    const refInput = screen.getByLabelText(/credential reference/i);
    await user.type(refInput, "TEST_REF");
    const submitButton = screen.getByRole("button", {
      name: /apply to selected targets/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSaveQueryCredential).toHaveBeenCalled();
    });

    // saveQueryCredential should only have been called for target 42 (Order MySQL).
    // It should NOT have been called for target 43 (Payment MySQL).
    const calledIds = mockSaveQueryCredential.mock.calls.map((c) => c[0]);
    expect(calledIds).toContain(42);
    expect(calledIds).not.toContain(43);
  });

  it("bulk remove only operates on currently filtered selectable targets", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());
    mockDeleteQueryCredential.mockResolvedValue(undefined);

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all targets.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Filter to "Staging" environment to hide "Order MySQL Instance".
    const comboboxes = screen.getAllByRole("combobox");
    const envTrigger = comboboxes[0];
    await user.click(envTrigger);

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "Staging" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: "Staging" }));

    // After filtering, only Payment MySQL should be visible and selected.
    await waitFor(() => {
      expect(screen.getByText(/1 selected/)).toBeInTheDocument();
    });

    expect(screen.queryByText("Order MySQL Instance")).toBeNull();

    // Open bulk remove.
    const removeButton = screen.getByRole("button", {
      name: /remove metadata/i,
    });
    await user.click(removeButton);

    // Confirm.
    const confirmCheckbox = screen.getByRole("checkbox", {
      name: /this removes the credential binding/i,
    });
    await user.click(confirmCheckbox);

    const submitButton = screen.getByRole("button", {
      name: /remove from selected targets/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockDeleteQueryCredential).toHaveBeenCalled();
    });

    // Should only call delete for target 43 (Payment MySQL).
    const calledIds = mockDeleteQueryCredential.mock.calls.map((c) => c[0]);
    expect(calledIds).toContain(43);
    expect(calledIds).not.toContain(42);
  });
});

// ---------------------------------------------------------------------------
// Phase 38B hardening P2: runtime status labels use correct helper
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — runtime status labels (P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("does not render raw credentialStateValues keys or raw enum values", async () => {
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({ runtimeStatus: "secret_resolved" }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Wait for credential statuses to load and badges to render.
    await waitFor(() => {
      expect(screen.getAllByText(/Ready — secret resolved/i).length).toBeGreaterThan(0);
    });

    // Must not show raw credentialStateValues keys.
    expect(screen.queryByText(/credentialStateValues/)).toBeNull();
    // Must not show raw enum values like "secret_resolved", "binding_mismatch".
    expect(screen.queryByText("secret_resolved")).toBeNull();
    expect(screen.queryByText("binding_mismatch")).toBeNull();
    expect(screen.queryByText("secret_missing")).toBeNull();
    expect(screen.queryByText("invalid_ref")).toBeNull();
    expect(screen.queryByText("missing_metadata")).toBeNull();
  });

  it("renders localized runtime status in the operations table", async () => {
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({ runtimeStatus: "binding_mismatch" }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Wait for the badge to render with the localized label.
    await waitFor(() => {
      expect(
        screen.getAllByText(/Credential does not match target/i).length,
      ).toBeGreaterThan(0);
    });

    // Raw enum must not appear.
    expect(screen.queryByText("binding_mismatch")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 38B hardening P2: invalid_ref is separate from binding_mismatch
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — coverage cards separate invalid_ref (P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("shows separate Invalid reference card", async () => {
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Coverage overview")).toBeInTheDocument();
    });

    // The "Invalid reference" card should be present (distinct from "Binding mismatch").
    expect(screen.getByText("Invalid reference")).toBeInTheDocument();
    expect(screen.getByText("Binding mismatch")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 38B hardening P4: cross-environment/cluster/host:port warning
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — cross-target warning in bulk apply (P4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("shows warning when selected targets span multiple environments", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    // buildTargets() creates targets in Production and Staging.
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all (Production + Staging).
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Open bulk apply.
    const applyButton = screen.getByRole("button", {
      name: /apply metadata/i,
    });
    await user.click(applyButton);

    // Warning about spanning multiple environments should appear.
    await waitFor(() => {
      expect(
        screen.getByText(/multiple environments/i),
      ).toBeInTheDocument();
    });
  });

  it("does not show warning when all selected targets share same environment", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    const sameEnvTargets = [
      buildQueryTarget({
        resourceId: 42,
        displayName: "Order MySQL Instance",
        resourceName: "order-mysql",
        connectionContext: {
          engine: "mysql",
          host: "shared-db.internal",
          port: 3306,
          environment: "Production",
          owner: "DBA Team",
          clusterName: "Order MySQL Cluster",
        },
      }),
      buildQueryTarget({
        resourceId: 44,
        displayName: "Inventory MySQL Instance",
        resourceName: "inventory-mysql",
        connectionContext: {
          engine: "mysql",
          host: "shared-db.internal",
          port: 3306,
          environment: "Production",
          owner: "DBA Team",
          clusterName: "Order MySQL Cluster",
        },
      }),
    ];

    renderSettings(sameEnvTargets);

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select all.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    // Open bulk apply.
    const applyButton = screen.getByRole("button", {
      name: /apply metadata/i,
    });
    await user.click(applyButton);

    // No cross-environment warning should appear.
    await waitFor(() => {
      expect(screen.getByText(/targets will be updated/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/multiple environments/i)).toBeNull();
  });
});

describe("QueryCredentialSettings ICU formatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("renders zh-CN credentialRefHint without ICU formatting error", async () => {
    const zhMessages = await import("@/messages/zh-CN.json");
    const targets = buildTargets();

    // The zh-CN messages previously used {ref} as an ICU placeholder,
    // which would be stripped at runtime. After the fix, the literal
    // text "CONTROLHUB_QUERY_CREDENTIAL_your-ref" should appear.
    renderSettings(targets, pageInfoFor(targets), zhMessages.default);

    // Select a target to show the detail panel.
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Order MySQL Instance"));

    // The credentialRefHint should contain the literal text, not a
    // stripped ICU placeholder. There are multiple elements matching
    // (credentialRefHint and boundaryNote both contain the text).
    await waitFor(() => {
      const elements = screen.getAllByText(/CONTROLHUB_QUERY_CREDENTIAL_your-ref/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    // Should NOT show "CONTROLHUB_QUERY_CREDENTIAL_" (without the ref)
    // which would indicate the ICU placeholder was stripped.
    expect(
      screen.queryByText(/CONTROLHUB_QUERY_CREDENTIAL_\s*。/),
    ).toBeNull();
  });

  it("renders zh-CN boundaryNote without ICU formatting error", async () => {
    const zhMessages = await import("@/messages/zh-CN.json");
    const targets = buildTargets();

    renderSettings(targets, pageInfoFor(targets), zhMessages.default);

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Order MySQL Instance"));

    // The boundaryNote should contain the literal text.
    await waitFor(() => {
      const elements = screen.getAllByText(/CONTROLHUB_QUERY_CREDENTIAL_your-ref/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders en credentialRefHint without ICU formatting error", async () => {
    const targets = buildTargets();

    renderSettings(targets);

    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      const elements = screen.getAllByText(/CONTROLHUB_QUERY_CREDENTIAL_your-ref/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// F0b: Credential Terminology and Secret Location Clarity
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — F0b credential terminology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("shows server secret reference label and derived env var", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "ORDER_MYSQL_RO",
        runtimeStatus: "secret_resolved",
      }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByLabelText(/server secret reference/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText("CONTROLHUB_QUERY_CREDENTIAL_ORDER_MYSQL_RO"),
    ).toBeInTheDocument();
  });

  it("does not show derived env var when credential ref is empty", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByLabelText(/server secret reference/i)).toBeInTheDocument();
    });

    expect(
      screen.queryByText("CONTROLHUB_QUERY_CREDENTIAL_"),
    ).toBeNull();
  });

  it("collapses help under 'How this binding works'", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Old cards should NOT be visible.
    expect(screen.queryByText("Standard read-only account")).toBeNull();
    expect(screen.queryByText("Cluster-specific override")).toBeNull();

    // Click the help disclosure.
    await user.click(
      screen.getByRole("button", { name: /how this binding works/i }),
    );

    // Old cards should still NOT be visible.
    expect(screen.queryByText("Standard read-only account")).toBeNull();
    expect(screen.queryByText("Cluster-specific override")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Review Finding 1: Credential delete success feedback
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — delete success feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("shows success feedback after successful delete", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "ORDER_MYSQL_RO",
        runtimeStatus: "secret_resolved",
      }),
    );
    mockDeleteQueryCredential.mockResolvedValue(undefined);

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByText("Remove credential metadata")).toBeInTheDocument();
    });

    // Click remove button to show confirmation.
    await user.click(screen.getByText("Remove credential metadata"));

    // Click confirm delete.
    await user.click(screen.getByText("Remove credential metadata?"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/credential metadata removed/i);
    });
  });

  it("does not show stale delete success after switching targets", async () => {
    const user = userEvent.setup();

    const deleteA = createDeferred<void>();
    mockDeleteQueryCredential.mockImplementation(
      () => deleteA.promise,
    );

    // First target load.
    mockGetQueryCredential.mockResolvedValueOnce(
      credentialResponse({
        configured: true,
        credentialRef: "ORDER_MYSQL_RO",
        runtimeStatus: "secret_resolved",
      }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Select first target and start delete.
    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByText("Remove credential metadata")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Remove credential metadata"));
    await user.click(screen.getByText("Remove credential metadata?"));

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    mockGetQueryCredential.mockResolvedValueOnce(
      credentialResponse({
        configured: false,
        credentialRef: "",
        runtimeStatus: "missing_metadata",
      }),
    );

    await user.click(screen.getByText("Payment MySQL Instance"));

    deleteA.resolve(undefined);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.queryByRole("status")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Review Finding 2: Server secret reference explanation in help section
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — server secret reference help", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("expanded help explains server secret references", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "LOCAL_QUERY_RO",
        runtimeStatus: "secret_resolved",
      }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Click the help disclosure.
    await user.click(
      screen.getByRole("button", { name: /how this binding works/i }),
    );

    // Should explain server secret reference model.
    expect(screen.getByText(/LOCAL_QUERY_RO is a server-side secret reference/)).toBeInTheDocument();
    // Multiple elements contain the env var name (derived display + help section).
    expect(screen.getAllByText(/CONTROLHUB_QUERY_CREDENTIAL_LOCAL_QUERY_RO/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/real DSN, database username, and password/)).toBeInTheDocument();
    expect(screen.getByText(/backend runtime environment/)).toBeInTheDocument();
  });

  it("does not render old abstract operating-model cards", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "LOCAL_QUERY_RO",
        runtimeStatus: "secret_resolved",
      }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Click the help disclosure.
    await user.click(
      screen.getByRole("button", { name: /how this binding works/i }),
    );

    // Old cards should NOT be rendered.
    expect(screen.queryByText("Standard read-only account")).toBeNull();
    expect(screen.queryByText("Cluster-specific override")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 38G Task G5: Master-detail credential inspector
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — master-detail inspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("selecting an operations row opens the credential form in a dialog", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Phase 38H: no permanent aside inspector.
    expect(
      screen.queryByRole("complementary", {
        name: /credential detail inspector/i,
      }),
    ).toBeNull();

    // Find the row and click the Configure/Edit button.
    const rows = screen.getAllByRole("row");
    const orderRow = rows.find((row) =>
      within(row).queryByText("Order MySQL Instance"),
    );
    expect(orderRow).toBeDefined();
    const editButton = within(
      requireElement(orderRow, "Expected Order MySQL row"),
    ).getByRole("button", {
      name: /configure|edit/i,
    });
    await user.click(editButton);

    // The dialog should open with the credential form.
    const dialog =
      screen.queryByRole("dialog") ??
      screen.queryByRole("complementary", { name: /credential/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(requireElement(dialog, "Expected credential dialog")).getByLabelText(
        /server secret reference/i,
      ),
    ).toBeInTheDocument();
  });

  it("selected operations row is highlighted", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Order MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      const orderRow = rows.find((row) =>
        within(row).queryByText("Order MySQL Instance"),
      );
      expect(orderRow).toBeDefined();
      expect(orderRow).toHaveAttribute("aria-selected", "true");
    });
  });

  it("credential form is rendered in a dialog, not appended after the table", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("complementary", {
        name: /credential detail inspector/i,
      }),
    ).toBeNull();

    const rows = screen.getAllByRole("row");
    const orderRow = rows.find((row) =>
      within(row).queryByText("Order MySQL Instance"),
    );
    const editButton = within(
      requireElement(orderRow, "Expected Order MySQL row"),
    ).getByRole("button", {
      name: /configure|edit/i,
    });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const dialog =
      screen.queryByRole("dialog") ??
      screen.queryByRole("complementary", { name: /credential/i });
    expect(dialog).toBeInTheDocument();
  });

  it("delete success remains visible in the dialog", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "ORDER_MYSQL_RO",
        runtimeStatus: "secret_resolved",
      }),
    );
    mockDeleteQueryCredential.mockResolvedValue(undefined);

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Open the credential form via the row-level Configure/Edit button.
    const rows = screen.getAllByRole("row");
    const orderRow = rows.find((row) =>
      within(row).queryByText("Order MySQL Instance"),
    );
    const editButton = within(
      requireElement(orderRow, "Expected Order MySQL row"),
    ).getByRole("button", {
      name: /configure|edit/i,
    });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByText("Remove credential metadata")).toBeInTheDocument();
    });

    // Click remove button.
    await user.click(screen.getByText("Remove credential metadata"));

    // Click confirm delete.
    await user.click(screen.getByText("Remove credential metadata?"));

    // Success should appear inside the dialog.
    await waitFor(() => {
      const dialog =
        screen.queryByRole("dialog") ??
        screen.queryByRole("complementary", { name: /credential/i });
      expect(dialog).toBeInTheDocument();
      expect(
        within(requireElement(dialog, "Expected credential dialog")).getByText(
          /credential metadata removed/i,
        ),
      ).toBeInTheDocument();
    });
  });
});

function mockMatchMedia(desktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function mockMobileMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("QueryCredentialSettings — small-screen detail adjacency (P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(false);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("renders the credential form in a dialog on small screens", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Phase 38H: no permanent aside inspector, no inline detail row.
    expect(
      screen.queryByRole("complementary", {
        name: /credential detail inspector/i,
      }),
    ).toBeNull();

    // Open via Configure/Edit button (works for both table rows and mobile cards).
    const editButtons = screen.getAllByRole("button", {
      name: /configure|edit/i,
    });
    expect(editButtons.length).toBeGreaterThan(0);
    await user.click(editButtons[0]);

    // The dialog should open with the credential form.
    const dialog =
      screen.queryByRole("dialog") ??
      screen.queryByRole("complementary", { name: /credential/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render a permanent desktop inspector on small screens", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Phase 38H: no permanent inspector at any viewport size.
    expect(
      screen.queryByRole("complementary", {
        name: /credential detail inspector/i,
      }),
    ).toBeNull();

    // Open the form via Configure/Edit button.
    const editButtons = screen.getAllByRole("button", {
      name: /configure|edit/i,
    });
    expect(editButtons.length).toBeGreaterThan(0);
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Still no permanent aside inspector.
    expect(
      screen.queryByRole("complementary", {
        name: /credential detail inspector/i,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 38H: Scalable IA reset — paged admin table, current-page fan-out,
// edit-via-modal/drawer instead of permanent detail inspector
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — Phase 38H scalable IA reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  function buildPagedTargets(count: number): QueryTarget[] {
    return Array.from({ length: count }, (_, i) => {
      const id = i + 1;
      return buildQueryTarget({
        resourceId: id,
        resourceName: `target-${id}`,
        displayName: `Target ${id}`,
        connectionContext: {
          engine: "mysql",
          host: `target-${id}.internal`,
          port: 3306,
          environment: id % 2 === 0 ? "Staging" : "Production",
          owner: "DBA Team",
          clusterName: `Cluster ${id % 5}`,
        },
      });
    });
  }

  function getRowContaining(text: string): HTMLElement {
    const row = screen
      .getAllByRole("row")
      .find((candidate) => within(candidate).queryByText(text));
    if (!row) {
      throw new Error(`Expected row containing ${text}`);
    }
    return row;
  }

  it("renders a paged admin table showing only the first page of targets", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());
    mockGetQueryTargets.mockResolvedValue({
      items: buildPagedTargets(75).slice(25, 50),
      pageInfo: {
        page: 2,
        pageSize: 25,
        totalItems: 75,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });

    renderSettings(
      buildPagedTargets(75).slice(0, 25),
      {
        page: 1,
        pageSize: 25,
        totalItems: 75,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Target 1")).toBeInTheDocument();
    });

    expect(screen.getByText("Target 25")).toBeInTheDocument();
    expect(screen.queryByText("Target 26")).toBeNull();
    expect(
      screen.getByText(/showing 1[-–]25 of 75/i),
    ).toBeInTheDocument();

    const nextPage = screen.getByRole("button", { name: /next page/i });
    expect(nextPage).toBeInTheDocument();

    await user.click(nextPage);
    await waitFor(() => {
      expect(screen.getByText("Target 26")).toBeInTheDocument();
    });
    expect(mockGetQueryTargets).toHaveBeenCalledWith(
      { page: 2, pageSize: 25 },
      expect.any(Object),
    );
  });

  it("fetches credential status only for the current page of targets", async () => {
    mockGetQueryCredential.mockImplementation((targetId: number) =>
      Promise.resolve(credentialResponse({ resourceId: targetId })),
    );

    renderSettings(
      buildPagedTargets(75).slice(0, 25),
      {
        page: 1,
        pageSize: 25,
        totalItems: 75,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Target 1")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockGetQueryCredential).toHaveBeenCalledTimes(25);
    });

    for (let id = 1; id <= 25; id++) {
      expect(mockGetQueryCredential).toHaveBeenCalledWith(id);
    }
    expect(mockGetQueryCredential).not.toHaveBeenCalledWith(26);
  });

  it("continues loading every server-page credential after a readiness filter hides a pending row", async () => {
    const user = userEvent.setup();
    const targets = buildPagedTargets(5);
    const pendingRequests = new Map<
      number,
      ReturnType<typeof createDeferred<QueryCredentialStatusResponse>>
    >();
    mockGetQueryCredential.mockImplementation((targetId: number) => {
      const request = createDeferred<QueryCredentialStatusResponse>();
      pendingRequests.set(targetId, request);
      return request.promise;
    });

    renderSettings(targets, pageInfoFor(targets));

    await waitFor(() => {
      expect(mockGetQueryCredential).toHaveBeenCalledTimes(4);
    });

    const readinessFilter = requireElement(
      screen.getAllByRole("combobox")[5],
      "Expected readiness filter",
    );
    await user.click(readinessFilter);
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Ready" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: "Ready" }));

    await waitFor(() => {
      expect(screen.queryByText("Target 5")).toBeNull();
    });

    for (const [targetId, request] of pendingRequests) {
      request.resolve(
        credentialResponse({
          resourceId: targetId,
          configured: true,
          runtimeStatus: "secret_resolved",
          executionEligible: true,
        }),
      );
    }

    await waitFor(() => {
      expect(screen.queryByText("Target 5")).toBeNull();
    });

    await waitFor(() => {
      for (const target of targets) {
        expect(mockGetQueryCredential).toHaveBeenCalledWith(target.resourceId);
      }
    });
  });

  it("ignores stale credential status responses after changing pages", async () => {
    const user = userEvent.setup();
    const firstPageResolvers: Array<{
      readonly targetId: number;
      readonly resolve: (value: QueryCredentialStatusResponse) => void;
    }> = [];

    mockGetQueryCredential.mockImplementation((targetId: number) => {
      if (targetId <= 25) {
        return new Promise<QueryCredentialStatusResponse>((resolve) => {
          firstPageResolvers.push({ targetId, resolve });
        });
      }
      return Promise.resolve(
        credentialResponse({
          resourceId: targetId,
          configured: true,
          credentialRef: `TARGET_${targetId}_RO`,
          runtimeStatus: "secret_resolved",
        }),
      );
    });
    mockGetQueryTargets.mockResolvedValue({
      items: buildPagedTargets(75).slice(25, 50),
      pageInfo: {
        page: 2,
        pageSize: 25,
        totalItems: 75,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });

    renderSettings(
      buildPagedTargets(75).slice(0, 25),
      {
        page: 1,
        pageSize: 25,
        totalItems: 75,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Target 1")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => {
      expect(screen.getByText("Target 26")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        within(getRowContaining("Target 26")).getByText("TARGET_26_RO"),
      ).toBeInTheDocument();
    });

    for (const pending of firstPageResolvers) {
      pending.resolve(
        credentialResponse({
          resourceId: pending.targetId,
          configured: true,
          credentialRef: `STALE_${pending.targetId}_RO`,
          runtimeStatus: "secret_resolved",
        }),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      within(getRowContaining("Target 26")).getByText("TARGET_26_RO"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/STALE_\d+_RO/)).toBeNull();
  });

  it("opens a row-level edit action in a modal instead of a permanent inspector", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        resourceId: 1,
        configured: true,
        credentialRef: "TARGET_1_RO",
        runtimeStatus: "secret_resolved",
      }),
    );

    renderSettings(
      buildPagedTargets(75).slice(0, 25),
      {
        page: 1,
        pageSize: 25,
        totalItems: 75,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Target 1")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("complementary", {
        name: /credential detail inspector/i,
      }),
    ).toBeNull();

    const rows = screen.getAllByRole("row");
    const firstRow = rows.find((row) =>
      within(row).queryByText("Target 1"),
    );
    expect(firstRow).toBeDefined();
    if (!firstRow) {
      throw new Error("Expected the first operations row to be defined");
    }
    const editButton = within(firstRow).getByRole("button", {
      name: /configure|edit/i,
    });
    await user.click(editButton);

    const dialog =
      screen.queryByRole("dialog") ??
      screen.queryByRole("complementary", { name: /credential/i });
    expect(dialog).toBeInTheDocument();
    if (!dialog) {
      throw new Error("Expected a credential dialog or drawer to be defined");
    }
    expect(
      within(dialog).getByLabelText(/server secret reference/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 38H: Mobile responsive card layout for credential operations
// ---------------------------------------------------------------------------

describe("QueryCredentialSettings — mobile responsive card layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMobileMedia();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("renders a mobile card layout with all operation fields visible (no clipping)", async () => {
    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "ORDER_MYSQL_RO",
        environmentPolicy: "non_prod_only",
        runtimeStatus: "secret_resolved",
      }),
    );

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // On mobile, no table rows should exist.
    expect(screen.queryAllByRole("row")).toHaveLength(0);

    // The target names should still be visible (in card layout).
    expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    expect(screen.getByText("Payment MySQL Instance")).toBeInTheDocument();

    // All metadata fields should be present (not clipped).
    expect(screen.getAllByText("mysql").length).toBeGreaterThan(0);
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Order MySQL Cluster")).toBeInTheDocument();
    expect(screen.getByText(/order-db\.internal/)).toBeInTheDocument();
    expect(screen.getAllByText(/Non-production only/i).length).toBeGreaterThan(0);
  });

  it("mobile card checkbox toggles selection", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Find checkboxes in the mobile card layout.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);

    await user.click(checkboxes[0]);

    await waitFor(() => {
      expect(screen.getByText(/1 selected/)).toBeInTheDocument();
    });
  });

  it("mobile card configure button opens the credential dialog", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    // Find the configure button in the mobile card.
    const configureButton = screen.getAllByRole("button", {
      name: /configure|edit/i,
    })[0];
    expect(configureButton).toBeDefined();

    await user.click(configureButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("mobile card shows retry button for fetch errors", async () => {
    mockGetQueryCredential.mockRejectedValue(new Error("Network error"));

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fetch error").length).toBeGreaterThan(0);
    });

    // Retry buttons should be present in the mobile card layout.
    const retryButtons = screen.getAllByRole("button", { name: /retry/i });
    expect(retryButtons.length).toBeGreaterThan(0);
  });
});

describe("QueryCredentialSettings — Phase 38H credential paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMatchMedia(true);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("resets to page one, requests the chosen 50-row backend page, and fans status out only to that page", async () => {
    const user = userEvent.setup();
    const allTargets = Array.from({ length: 75 }, (_, index) =>
      buildQueryTarget({
        resourceId: index + 1,
        resourceName: `target-${index + 1}`,
        displayName: `Target ${index + 1}`,
      }),
    );
    const targets = allTargets.slice(0, 50);
    mockGetQueryCredential.mockImplementation((targetId: number) =>
      Promise.resolve(credentialResponse({ resourceId: targetId })),
    );
    mockGetQueryTargets.mockResolvedValue({
      items: targets,
      pageInfo: {
        page: 1,
        pageSize: 50,
        totalItems: 75,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });

    renderSettings(allTargets.slice(25, 50), {
      page: 2,
      pageSize: 25,
      totalItems: 75,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });

    await waitFor(() => {
      expect(screen.getByText("Target 26")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("combobox", { name: /rows per page/i }));
    await user.click(await screen.findByRole("option", { name: "50 / page" }));

    await waitFor(() => {
      expect(mockGetQueryTargets).toHaveBeenCalledWith(
        { page: 1, pageSize: 50 },
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Target 1")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockGetQueryCredential).toHaveBeenCalledWith(50);
    });
    expect(mockGetQueryCredential).not.toHaveBeenCalledWith(51);
    expect(
      screen.getAllByText(/status totals reflect this page and current filters/i),
    ).toHaveLength(2);
  });

  it("uses the server page booleans to disable pager navigation", async () => {
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings(buildTargets(), {
      page: 2,
      pageSize: 25,
      totalItems: 75,
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Order MySQL Instance")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });
});

describe("QueryCredentialSettings — Phase 38H responsive detail dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    mockMobileMedia();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
  });

  it("opens a full-screen scrollable editor on small screens and restores focus after Escape", async () => {
    const user = userEvent.setup();
    mockGetQueryCredential.mockResolvedValue(credentialResponse());

    renderSettings();

    const editButtons = await screen.findAllByRole("button", {
      name: /configure|edit/i,
    });
    const editButton = editButtons[0];
    if (!editButton) {
      throw new Error("Expected a credential editor trigger");
    }
    await user.click(editButton);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("inset-0");
    expect(dialog).toHaveClass("overflow-y-auto");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(editButton).toHaveFocus();
  });
});
