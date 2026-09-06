// input: @/lib/operator-session/facade, next/server
// output: Vitest tests for login/logout/authenticateCookie/gatePage
// pos: unit-level contract tests for the Operator Session facade
// note: if this file changes, update header and tests/lib/README.md
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authenticateCookie, gatePage, login, logout, readIdentity } from "@/lib/operator-session/facade";
import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";
import { sealSession } from "@/lib/operator-session/seal";
import { loadOperatorSessionConfig } from "@/lib/operator-session/config";

const ACTIVE_KEY_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const ACTIVE_KEY_BASE64 = Buffer.from(ACTIVE_KEY_HEX, "hex").toString("base64");
const ORIGIN = "http://localhost:3100";
const TOKEN = "server-issued-bearer-token";

function stubBffEnv() {
  vi.stubEnv("CONTROLHUB_BFF_SESSION_KEY", ACTIVE_KEY_BASE64);
  vi.stubEnv("CONTROLHUB_BFF_CONSOLE_ORIGIN", ORIGIN);
  vi.stubEnv("CONTROLHUB_BFF_SECURE_COOKIES", "true");
  vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Operator Session facade", () => {
  it("login seals the bearer into the cookie and returns identity without the credential", async () => {
    stubBffEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ token: TOKEN, role: "admin" }), { status: 200 }),
      ),
    );
    const request = new NextRequest("http://localhost:3100/api/operator-session", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "secret123" }),
    });
    const response = await login(request);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ email: "admin@example.com", role: "admin" });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.httpOnly).toBe(true);
  });

  it("maps missing, malformed, and tampered cookies to the same 401", () => {
    stubBffEnv();
    const missing = authenticateCookie(
      new NextRequest("http://localhost:3100/api/proxy/resources", { method: "GET" }),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.response.status).toBe(401);

    const malformed = authenticateCookie(
      new NextRequest("http://localhost:3100/api/proxy/resources", {
        method: "GET",
        headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-seal` },
      }),
    );
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.response.status).toBe(401);

    const config = loadOperatorSessionConfig();
    if (!config.ok) throw new Error("config");
    const tampered = sealSession({ token: TOKEN, role: "admin" }, config.value) + "x";
    const rejected = authenticateCookie(
      new NextRequest("http://localhost:3100/api/proxy/resources", {
        method: "GET",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${tampered}` },
      }),
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.response.status).toBe(401);

    const expiredSeal = sealSession(
      { token: TOKEN, role: "admin" },
      config.value,
      Date.now() - 9 * 60 * 60 * 1000,
    );
    const expired = authenticateCookie(
      new NextRequest("http://localhost:3100/api/proxy/resources", {
        method: "GET",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${expiredSeal}` },
      }),
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.response.status).toBe(401);
  });

  it("logout clears the session cookie", async () => {
    stubBffEnv();
    const request = new NextRequest("http://localhost:3100/api/operator-session", {
      method: "DELETE",
      headers: { origin: ORIGIN },
    });
    const response = await logout(request);
    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
  });

  it("gatePage sends an authenticated operator away from /login", () => {
    stubBffEnv();
    const config = loadOperatorSessionConfig();
    if (!config.ok) throw new Error("config");
    const sealed = sealSession({ token: TOKEN, role: "admin" }, config.value);
    const request = new NextRequest("http://localhost:3100/login", {
      method: "GET",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sealed}` },
    });
    const response = gatePage(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/overview");
  });

  it("readIdentity returns sealed email and role without the credential", async () => {
    stubBffEnv();
    const config = loadOperatorSessionConfig();
    if (!config.ok) throw new Error("config");
    const sealed = sealSession(
      { token: TOKEN, role: "admin", email: "operator@example.com", displayName: "Lin Operator" },
      config.value,
    );
    const response = readIdentity(
      new NextRequest("http://localhost:3100/api/operator-session", {
        method: "GET",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sealed}` },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      email: "operator@example.com",
      displayName: "Lin Operator",
      role: "admin",
    });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it("gatePage preserves the protected path and query on the login return target", () => {
    stubBffEnv();
    const request = new NextRequest("http://localhost:3100/audits?environment=staging", {
      method: "GET",
    });
    const response = gatePage(request);
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/audits?environment=staging");
  });
});
