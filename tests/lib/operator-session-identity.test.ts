import { afterEach, describe, expect, it, vi } from "vitest";

import { performBackendLogin } from "@/lib/operator-session/backend";

describe("operator-session identity", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps backend-provided identity with the authenticated login outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            token: "server-token",
            role: "admin",
            email: "operator@example.com",
            displayName: "Lin Operator",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      performBackendLogin("operator@example.com", "password"),
    ).resolves.toMatchObject({
      ok: true,
      email: "operator@example.com",
      displayName: "Lin Operator",
      role: "admin",
    });
  });

  it("binds the authenticated login identifier when the backend omits email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: "server-token", role: "operator" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      performBackendLogin("operator@example.com", "password"),
    ).resolves.toMatchObject({
      ok: true,
      email: "operator@example.com",
      role: "operator",
    });
  });
});
