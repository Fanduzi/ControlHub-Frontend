// input: machine-principal service functions and mocked api client
// output: HTTP contract and request-whitelist tests
// pos: Frontend boundary for backend dbe6203 machine-principal administration
// note: if this file changes, update tests/services/README.md.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from "@/services/api-client";
import {
  createMachinePrincipal,
  listMachinePrincipals,
  revokeMachineCredential,
  rotateMachineCredential,
} from "@/services/machine-principals";

const mockApiClient = vi.mocked(apiClient);

function bodyOfCall(): Record<string, unknown> {
  const init = mockApiClient.mock.calls[0]?.[1] as RequestInit | undefined;
  expect(init?.body).toEqual(expect.any(String));
  return JSON.parse(init!.body as string) as Record<string, unknown>;
}

describe("machine-principal service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists principals through the admin endpoint", async () => {
    mockApiClient.mockResolvedValueOnce({ items: [] });

    await expect(listMachinePrincipals()).resolves.toEqual({ items: [] });
    expect(mockApiClient).toHaveBeenCalledWith("/admin/machine-principals");
  });

  it("creates with only the backend-supported fields", async () => {
    mockApiClient.mockResolvedValueOnce({
      principal: { id: 7, name: "inventory-agent" },
      credential: { id: 8, scopes: ["inventory:read"] },
      secret: "one-time-secret",
    });

    await createMachinePrincipal({
      name: "inventory-agent",
      scopes: ["inventory:read"],
      expiresAt: "2026-09-29T12:00:00.000Z",
      actorUserId: 99,
    } as never);

    expect(mockApiClient).toHaveBeenCalledWith("/admin/machine-principals", {
      method: "POST",
      body: JSON.stringify({
        name: "inventory-agent",
        scopes: ["inventory:read"],
        expiresAt: "2026-09-29T12:00:00.000Z",
      }),
    });
    expect(bodyOfCall()).not.toHaveProperty("actorUserId");
  });

  it("rotates and revokes a credential by credential id", async () => {
    mockApiClient.mockResolvedValueOnce({ secret: "rotated-secret" });
    await rotateMachineCredential(8, {
      scopes: ["audit:read", "inventory:read"],
      expiresAt: "2026-09-29T12:00:00.000Z",
    });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/admin/machine-credentials/8/rotate",
      {
        method: "POST",
        body: JSON.stringify({
          scopes: ["audit:read", "inventory:read"],
          expiresAt: "2026-09-29T12:00:00.000Z",
        }),
      },
    );

    mockApiClient.mockResolvedValueOnce(undefined);
    await revokeMachineCredential(8);
    expect(mockApiClient).toHaveBeenLastCalledWith(
      "/admin/machine-credentials/8/revoke",
      { method: "POST" },
    );
  });
});
