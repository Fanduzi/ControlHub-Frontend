// input: machine-principal settings component and mocked service/auth state
// output: admin gate, one-time secret, explicit rotation scope, and lifecycle interaction tests
// pos: Accessible browser seam for machine-principal administration
// note: if this file changes, update tests/components/README.md.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/machine-principals", () => ({
  listMachinePrincipals: vi.fn(),
  createMachinePrincipal: vi.fn(),
  rotateMachineCredential: vi.fn(),
  revokeMachineCredential: vi.fn(),
}));

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

import {
  createMachinePrincipal,
  listMachinePrincipals,
  revokeMachineCredential,
  rotateMachineCredential,
} from "@/services/machine-principals";
import { copyToClipboard } from "@/lib/clipboard";
import { MachinePrincipalSettings } from "@/components/settings/machine-principal-settings";
import type { MachineScope } from "@/types/machine-principal";

const mockList = vi.mocked(listMachinePrincipals);
const mockCreate = vi.mocked(createMachinePrincipal);
const mockRotate = vi.mocked(rotateMachineCredential);
const mockRevoke = vi.mocked(revokeMachineCredential);
const mockCopyToClipboard = vi.mocked(copyToClipboard);
const activeExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const issuedCredential = {
  id: 8,
  machinePrincipalId: 7,
  scopes: ["inventory:read"] as MachineScope[],
  expiresAt: activeExpiry,
  lastUsedAt: null,
  revokedAt: null,
  rotatedFromCredentialId: null,
  createdAt: "2026-08-30T12:00:00.000Z",
};

const principal = {
  id: 7,
  name: "inventory-agent",
  createdByUserId: 1,
  createdAt: "2026-08-30T12:00:00.000Z",
  credentials: [{
    id: 8,
    createdAt: "2026-08-30T12:00:00.000Z",
    expiresAt: activeExpiry,
    lastUsedAt: null,
    revokedAt: null,
  }, {
    id: 9,
    createdAt: "2026-08-30T12:05:00.000Z",
    expiresAt: activeExpiry,
    lastUsedAt: null,
    revokedAt: "2026-08-30T13:00:00.000Z",
  }],
};

function renderSettings(locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={{}}>
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
      credential: issuedCredential,
      secret: "create-secret-once",
    } as never);

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

  it("reloads every safe lifecycle record and keeps both overlap records actionable", async () => {
    mockList.mockResolvedValue({ items: [principal] });
    mockRotate.mockResolvedValue({
      principal,
      credential: { ...issuedCredential, id: 10 },
      secret: "rotate-secret-once",
    } as never);

    const user = userEvent.setup();
    renderSettings();
    await screen.findByRole("row", { name: /credential #8/i });

    const activeCredential = screen.getByRole("row", { name: /credential #8/i });
    expect(within(activeCredential).getByRole("button", { name: /rotate/i })).toBeEnabled();
    expect(within(activeCredential).getByRole("button", { name: /revoke/i })).toBeEnabled();
    expect(screen.getByRole("row", { name: /credential #9/i })).toHaveTextContent(/revoked/i);

    await user.click(within(activeCredential).getByRole("button", { name: /rotate/i }));
    const replacementScopes = screen.getByRole("group", { name: /replacement scopes/i });
    expect(screen.getByRole("button", { name: /confirm rotation/i })).toBeDisabled();
    await user.click(within(replacementScopes).getByLabelText("inventory:read"));
    await user.click(screen.getByRole("button", { name: /confirm rotation/i }));

    await waitFor(() => expect(screen.getByText("rotate-secret-once")).toBeInTheDocument());
    const replacementCredential = await screen.findByRole("row", { name: /credential #10/i });
    expect(within(activeCredential).getByRole("button", { name: /rotate/i })).toBeEnabled();
    expect(within(activeCredential).getByRole("button", { name: /revoke/i })).toBeEnabled();
    expect(within(replacementCredential).getByRole("button", { name: /rotate/i })).toBeEnabled();
    expect(within(replacementCredential).getByRole("button", { name: /revoke/i })).toBeEnabled();
    expect(screen.queryByText("create-secret-once")).toBeNull();
    expect(mockRotate).toHaveBeenCalledWith(8, expect.objectContaining({ scopes: ["inventory:read"] }));
    expect(screen.getByText(/old credential works until you revoke it or it expires/i)).toBeInTheDocument();
  });

  it("prevents duplicate revoke requests for a credential while it is in flight", async () => {
    mockList.mockResolvedValue({ items: [principal] });
    let resolve!: () => void;
    mockRevoke.mockReturnValue(new Promise<void>((done) => { resolve = done; }));

    const user = userEvent.setup();
    renderSettings();
    const activeCredential = await screen.findByRole("row", { name: /credential #8/i });
    const revoke = within(activeCredential).getByRole("button", { name: /revoke/i });
    await user.click(revoke);
    await user.click(revoke);

    expect(mockRevoke).toHaveBeenCalledTimes(1);
    expect(revoke).toBeDisabled();
    resolve();
    await waitFor(() => expect(revoke).toBeDisabled());
  });

  it("gives accessible manual-copy feedback when clipboard access fails", async () => {
    mockList.mockResolvedValue({ items: [] });
    mockCreate.mockResolvedValue({ principal, credential: issuedCredential, secret: "copy-me" } as never);
    mockCopyToClipboard.mockResolvedValueOnce(false);

    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(mockList).toHaveBeenCalledOnce());
    await user.type(screen.getByLabelText(/principal name/i), "inventory-agent");
    await user.click(screen.getByRole("button", { name: /create principal/i }));
    await user.click(await screen.findByRole("button", { name: /copy secret/i }));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("copy-me");
    expect(await screen.findByRole("status")).toHaveTextContent(/copy the secret manually/i);
  });

  it("enforces expiry bounds and supports every canonical scope", async () => {
    mockList.mockResolvedValue({ items: [] });
    mockCreate.mockResolvedValue({ principal, credential: issuedCredential, secret: "all-scopes" } as never);
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(mockList).toHaveBeenCalledOnce());
    await user.type(screen.getByLabelText(/principal name/i), "inventory-agent");
    for (const scope of ["relations:read", "governed-select", "audit:read", "named-views:read"]) {
      await user.click(screen.getByLabelText(scope));
    }
    await user.clear(screen.getByLabelText(/lifetime/i));
    await user.type(screen.getByLabelText(/lifetime/i), "91");
    await user.click(screen.getByRole("button", { name: /create principal/i }));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/lifetime/i)).toBeInvalid();

    await user.clear(screen.getByLabelText(/lifetime/i));
    await user.type(screen.getByLabelText(/lifetime/i), "30");
    await user.click(screen.getByRole("button", { name: /create principal/i }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      scopes: ["inventory:read", "relations:read", "governed-select", "audit:read", "named-views:read"],
    })));
  });

  it("leaves the record actionable after a revoke service failure", async () => {
    mockList.mockResolvedValue({ items: [principal] });
    mockRevoke.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    renderSettings();
    const row = await screen.findByRole("row", { name: /credential #8/i });
    await user.click(within(row).getByRole("button", { name: /revoke/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be completed/i);
    expect(within(row).getByRole("button", { name: /revoke/i })).toBeEnabled();
  });

  it("uses localized Chinese lifecycle and overlap copy", async () => {
    mockList.mockResolvedValue({ items: [principal] });
    renderSettings("zh-CN");

    expect(await screen.findByText("机器主体")).toBeInTheDocument();
    expect(screen.getByText(/旧凭证会继续有效.*到期/)).toBeInTheDocument();
  });

  it("marks expired credentials as disabled with localized status", async () => {
    mockList.mockResolvedValue({
      items: [{
        ...principal,
        credentials: [{
          ...principal.credentials[0],
          expiresAt: expiredAt,
        }],
      }],
    });
    renderSettings("zh-CN");

    const row = await screen.findByRole("row", { name: /凭证 #8/i });
    expect(within(row).getByText("已过期")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /轮换/i })).toBeDisabled();
    expect(within(row).getByRole("button", { name: /撤销/i })).toBeDisabled();
  });
});
