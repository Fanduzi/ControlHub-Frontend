import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
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

import {
  deleteQueryCredential,
  getQueryCredential,
  saveQueryCredential,
} from "@/services/query-credentials";
import { QueryCredentialSettings } from "@/components/settings/query-credential-settings";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";
import type {
  QueryCredentialStatusResponse,
  QueryCredentialUpsertRequest,
} from "@/types/query-credential";
import enMessages from "@/messages/en.json";

const mockGetQueryCredential = vi.mocked(getQueryCredential);
const mockSaveQueryCredential = vi.mocked(saveQueryCredential);
const mockDeleteQueryCredential = vi.mocked(deleteQueryCredential);

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
  messages: Record<string, unknown> = enMessages,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryCredentialSettings targets={targets} />
    </NextIntlClientProvider>,
  );
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
    expect(screen.queryByLabelText(/credential ref/i)).toBeNull();
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
    expect(screen.queryByLabelText(/credential ref/i)).toBeNull();
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
  });

  afterEach(() => {
    window.sessionStorage.clear();
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

    // Credential detail panel should appear.
    await waitFor(() => {
      expect(screen.getByText("Credential binding")).toBeInTheDocument();
    });

    // getQueryCredential should have been called for target 42.
    expect(mockGetQueryCredential).toHaveBeenCalledWith(42);
  });
});

describe("QueryCredentialSettings stale target guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("does not display target A's credentialRef after switching to target B", async () => {
    const user = userEvent.setup();

    let resolveLoadA!: (value: QueryCredentialStatusResponse) => void;
    mockGetQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        return new Promise<QueryCredentialStatusResponse>((resolve) => {
          resolveLoadA = resolve;
        });
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

    // Switch to target B before A resolves.
    await user.click(screen.getByText("Payment MySQL Instance"));

    // Wait for B's detail panel.
    await waitFor(() => {
      expect(screen.getByText("Credential binding")).toBeInTheDocument();
    });

    // Now resolve A's request.
    resolveLoadA(
      credentialResponse({
        resourceId: 42,
        credentialRef: "ORDER_MYSQL_RO",
        configured: true,
        runtimeStatus: "secret_resolved",
      }),
    );

    // Wait a tick for any stale setState to settle.
    await new Promise((r) => setTimeout(r, 50));

    // B's credentialRef input should be empty, not A's "ORDER_MYSQL_RO".
    const input = screen.getByLabelText(/credential ref/i) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.queryByText("ORDER_MYSQL_RO")).toBeNull();
  });

  it("does not display target A's save error after switching to target B", async () => {
    const user = userEvent.setup();
    let rejectSaveA!: (reason: Error) => void;

    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "EXISTING_REF",
        runtimeStatus: "secret_resolved",
      }),
    );
    mockSaveQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        return new Promise<never>((_resolve, reject) => {
          rejectSaveA = reject;
        });
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
      expect(screen.getByText("Credential binding")).toBeInTheDocument();
    });

    // Fill in and save for target A.
    const input = screen.getByLabelText(/credential ref/i);
    await user.clear(input);
    await user.type(input, "NEW_REF");

    const saveButton = screen.getByRole("button", {
      name: /edit credential metadata/i,
    });
    await user.click(saveButton);

    // Switch to target B before A's save settles.
    await user.click(screen.getByText("Payment MySQL Instance"));

    await waitFor(() => {
      expect(screen.getByText("Credential binding")).toBeInTheDocument();
    });

    // Reject A's save.
    rejectSaveA(new Error("save failed for A"));

    // Wait a tick.
    await new Promise((r) => setTimeout(r, 50));

    // B should not show A's error.
    expect(screen.queryByText("save failed for A")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not display target A's delete result after switching to target B", async () => {
    const user = userEvent.setup();
    let resolveDeleteA!: (value: void) => void;

    mockGetQueryCredential.mockResolvedValue(
      credentialResponse({
        configured: true,
        credentialRef: "EXISTING_REF",
        runtimeStatus: "secret_resolved",
      }),
    );
    mockDeleteQueryCredential.mockImplementation((targetId: number) => {
      if (targetId === 42) {
        return new Promise<void>((resolve) => {
          resolveDeleteA = resolve;
        });
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
      expect(screen.getByText("Credential binding")).toBeInTheDocument();
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

    // Switch to B before delete resolves.
    await user.click(screen.getByText("Payment MySQL Instance"));
    await waitFor(() => {
      expect(screen.getByText("Credential binding")).toBeInTheDocument();
    });

    // Resolve A's delete.
    resolveDeleteA();

    // Wait a tick.
    await new Promise((r) => setTimeout(r, 50));

    // B should not show any error from A's delete.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("QueryCredentialSettings — disabled environmentPolicy response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
  });

  afterEach(() => {
    window.sessionStorage.clear();
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
      expect(screen.getByText("Credential binding")).toBeInTheDocument();
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
      expect(screen.getByText("Credential binding")).toBeInTheDocument();
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
      screen.getByRole("button", { name: /configure credential metadata/i }),
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
    await user.click(policyTrigger!);

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
