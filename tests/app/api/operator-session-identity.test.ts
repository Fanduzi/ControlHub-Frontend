// input: Vitest, NextRequest, Operator Session route and seal primitive
// output: route contracts for sealed operator identity without credential disclosure
// pos: integration-level identity tests at the sealed-session GET boundary
// note: if this file changes, update this header and tests/app/api/README.md
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const config = {
    activeKey: Buffer.from(
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
      "hex",
    ),
    previousKey: null,
    consoleOrigin: "http://localhost:3000",
    secureCookies: false,
  };
  return {
    config,
    loadOperatorSessionConfig: vi.fn(() => ({
    ok: true,
      value: config,
    })),
    performBackendLogin: vi.fn(),
  };
});

vi.mock("@/lib/operator-session/config", () => ({
  loadOperatorSessionConfig: mocks.loadOperatorSessionConfig,
}));
vi.mock("@/lib/operator-session/backend", () => ({
  performBackendLogin: mocks.performBackendLogin,
}));
vi.mock("@/lib/operator-session/origin", () => ({
  isUnsafeMethod: () => true,
  originAllowed: () => true,
}));
vi.mock("@/lib/operator-session/session-cookie", () => ({
  clearSessionCookie: vi.fn(),
  setSessionCookie: vi.fn(),
}));
vi.mock("@/lib/operator-session/constants", () => ({
  SESSION_COOKIE_NAME: "controlhub.operator-session",
  SESSION_MAX_AGE_SECONDS: 8 * 60 * 60,
  SESSION_PREVIOUS_KEY_WINDOW_SECONDS: 15 * 60,
}));

import { GET, POST } from "@/app/api/operator-session/route";
import { sealSession } from "@/lib/operator-session/seal";

describe("/api/operator-session identity contract", () => {
  it("round-trips sealed identity through GET without the backend credential", async () => {
    const sealed = sealSession(
      {
        token: "server-token",
        email: "operator@example.com",
        displayName: "Lin Operator",
        role: "admin",
      },
      mocks.config,
    );

    const response = await GET(
      new NextRequest("http://localhost:3000/api/operator-session", {
        headers: { cookie: `controlhub.operator-session=${sealed}` },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      email: "operator@example.com",
      displayName: "Lin Operator",
      role: "admin",
    });
    expect(body).not.toHaveProperty("token");
  });

  it("returns identity from a successful login without returning the credential", async () => {
    mocks.performBackendLogin.mockResolvedValue({
      ok: true,
      token: "server-token",
      email: "operator@example.com",
      displayName: "Lin Operator",
      role: "admin",
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/operator-session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: "operator@example.com",
          password: "password",
        }),
      }),
    );
    const body = await response.json();

    expect(body).toEqual({
      email: "operator@example.com",
      displayName: "Lin Operator",
      role: "admin",
    });
    expect(body).not.toHaveProperty("token");
  });
});
