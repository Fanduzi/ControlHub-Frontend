// input: machine-principal settings component and mocked service/auth state
// output: admin gate, one-time secret, and lifecycle interaction tests
// pos: Accessible browser seam for machine-principal administration
// note: if this file changes, update tests/components/README.md.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/machine-principals", () => ({
  listMachinePrincipals: vi.fn(),
  createMachinePrincipal: vi.fn(),
  rotateMachineCredential: vi.fn(),
  revokeMachineCredential: vi.fn(),
}));

import {
  createMachinePrincipal,
  listMachinePrincipals,
  rotateMachineCredential,
} from "@/services/machine-principals";
import { MachinePrincipalSettings } from "@/components/settings/machine-principal-settings";
import type { MachineScope } from "@/types/machine-principal";

const mockList = vi.mocked(listMachinePrincipals);
const mockCreate = vi.mocked(createMachinePrincipal);
const mockRotate = vi.mocked(rotateMachineCredential);

const principal = {
  id: 7,
  name: "inventory-agent",
  createdByUserId: 1,
  createdAt: "2026-08-30T12:00:00.000Z",
  credential: {
    id: 8,
    machinePrincipalId: 7,
    lookupId: "lookup",
    scopes: ["inventory:read"] as MachineScope[],
    expiresAt: "2026-09-29T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    rotatedFromCredentialId: null,
    createdAt: "2026-08-30T12:00:00.000Z",
  },
};

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <MachinePrincipalSettings />
    </NextIntlClientProvider>,
  );
}

describe("MachinePrincipalSettings authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("denies non-admins without calling the administration API", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderSettings();

    await waitFor(() => {
      expect(screen.getByText(/only administrators/i)).toBeInTheDocument();
    });
    expect(mockList).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /create/i })).toBeNull();
  });
});

describe("MachinePrincipalSettings secret lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("controlhub.role", "admin");
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows a create secret once and clears it when dismissed", async () => {
    mockList.mockResolvedValue({ items: [] });
    mockCreate.mockResolvedValue({
      principal,
      credential: principal.credential,
      secret: "create-secret-once",
    });

    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(mockList).toHaveBeenCalledOnce());

    await user.type(screen.getByLabelText(/principal name/i), "inventory-agent");
    await user.click(screen.getByRole("button", { name: /create principal/i }));

    await waitFor(() => {
      expect(screen.getByText("create-secret-once")).toBeInTheDocument();
    });
    expect(screen.getAllByText("create-secret-once")).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "inventory-agent",
        scopes: ["inventory:read"],
      }),
    );

    await user.click(screen.getByRole("button", { name: /dismiss secret/i }));
    expect(screen.queryByText("create-secret-once")).toBeNull();
  });

  it("rotates an existing credential and reveals only the new secret", async () => {
    mockList.mockResolvedValue({ items: [principal] });
    mockRotate.mockResolvedValue({
      principal,
      credential: { ...principal.credential, id: 9 },
      secret: "rotate-secret-once",
    });

    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(screen.getByText("inventory-agent")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /rotate/i }));

    await waitFor(() => expect(screen.getByText("rotate-secret-once")).toBeInTheDocument());
    expect(screen.queryByText("create-secret-once")).toBeNull();
    expect(mockRotate).toHaveBeenCalledWith(8, expect.objectContaining({ scopes: ["inventory:read"] }));
  });
});
