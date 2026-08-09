// input: @/lib/operator-session/backend
// output: Vitest tests for server-side BFF login against the existing backend login API
// pos: unit-level contract tests for the BFF backend-login boundary and generic error mapping
// note: if this file changes, update header and tests/lib/README.md
import { afterEach, describe, expect, it, vi } from "vitest";

import { performBackendLogin } from "@/lib/operator-session/backend";

const TOKEN = "server-issued-bearer-token";
const PASSWORD = "super-secret-password";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubLoginResponse(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe("performBackendLogin", () => {
  it("returns the backend token and role on success", async () => {
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
    stubLoginResponse(200, { token: TOKEN, role: "admin" });
    const outcome = await performBackendLogin("admin@example.com", PASSWORD);
    expect(outcome).toEqual({ ok: true, token: TOKEN, role: "admin" });
  });

  it("maps backend 401 to invalid-credentials without leaking details", async () => {
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
    stubLoginResponse(401, { message: "account disabled: reason XYZ" });
    const outcome = await performBackendLogin("admin@example.com", PASSWORD);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("invalid-credentials");
    expect(JSON.stringify(outcome)).not.toContain("disabled");
    expect(JSON.stringify(outcome)).not.toContain(PASSWORD);
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
  });

  it("maps backend 5xx to backend-unavailable without leaking details", async () => {
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
    stubLoginResponse(500, { error: "mysql connection refused: 10.0.0.1:3306" });
    const outcome = await performBackendLogin("admin@example.com", PASSWORD);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("backend-unavailable");
    expect(JSON.stringify(outcome)).not.toContain("mysql");
    expect(JSON.stringify(outcome)).not.toContain(PASSWORD);
  });

  it("maps network failures to backend-unavailable", async () => {
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const outcome = await performBackendLogin("admin@example.com", PASSWORD);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("backend-unavailable");
  });

  it("treats a success response without a token as backend-unavailable", async () => {
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
    stubLoginResponse(200, { role: "admin" });
    const outcome = await performBackendLogin("admin@example.com", PASSWORD);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("backend-unavailable");
  });

  it("uses the configured server-side backend base URL", async () => {
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(async () =>
      new Response(JSON.stringify({ token: TOKEN, role: "admin" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await performBackendLogin("admin@example.com", PASSWORD);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://backend.test/auth/login");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body)) as {
      email: string;
      password: string;
    };
    expect(body).toEqual({ email: "admin@example.com", password: PASSWORD });
  });
});
