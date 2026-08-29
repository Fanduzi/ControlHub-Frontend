import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  loadOperatorSessionConfig: vi.fn(() => ({
    ok: true,
    value: { consoleOrigin: "http://localhost:3000", secureCookies: false },
  })),
  unsealSession: vi.fn(),
  performBackendLogin: vi.fn(),
  sealSession: vi.fn(() => "sealed-session"),
}));

vi.mock("@/lib/operator-session/config", () => ({
  loadOperatorSessionConfig: mocks.loadOperatorSessionConfig,
}));
vi.mock("@/lib/operator-session/seal", () => ({
  sealSession: mocks.sealSession,
  unsealSession: mocks.unsealSession,
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
}));

import { GET, POST } from "@/app/api/operator-session/route";

describe("/api/operator-session identity contract", () => {
  it("returns trusted session identity without the backend credential", async () => {
    mocks.unsealSession.mockReturnValue({
      ok: true,
      payload: {
        token: "server-token",
        email: "operator@example.com",
        displayName: "Lin Operator",
        role: "admin",
      },
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/operator-session", {
        headers: { cookie: "controlhub.operator-session=sealed-session" },
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
