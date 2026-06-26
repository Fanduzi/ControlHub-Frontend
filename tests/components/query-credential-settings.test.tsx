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
import type { QueryCredentialStatusResponse } from "@/types/query-credential";
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

  it("renders the restricted view when no role is stored (SSR-equivalent)", async () => {
    // In jsdom (where typeof window !== "undefined"), readIsAdmin() returns
    // false when no role is stored — same as the SSR loading guard on the
    // server where typeof window === "undefined" returns null and the
    // component renders a loading skeleton. In both cases, non-admin users
    // never see the management form.
    renderSettings();

    await waitFor(() => {
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

    // After role resolution, the target list search box should appear.
    await waitFor(() => {
      expect(
        screen.getByRole("searchbox", {
          name: /search target name, host, or environment/i,
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
    // The raw "disabled" value must never appear.
    expect(screen.queryByText("disabled")).toBeNull();
    expect(screen.queryByText(/^disabled$/i)).toBeNull();
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
