// input: @/proxy, next/server, @/lib/operator-session/config, @/lib/operator-session/seal, @/lib/operator-session/constants
// output: Vitest tests for the console route guard (valid sessions pass; forged/tampered/unknown-key/expired fail closed)
// pos: unit-level contract tests for the Operator Session page boundary enforced by the proxy
// note: if this file changes, update header and tests/app/README.md
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";
import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";
import { sealSession } from "@/lib/operator-session/seal";

const ACTIVE_KEY_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const OTHER_KEY_HEX =
  "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f";

function stubBffEnv() {
  vi.stubEnv("CONTROLHUB_BFF_SESSION_KEY", ACTIVE_KEY_HEX);
  vi.stubEnv("CONTROLHUB_BFF_CONSOLE_ORIGIN", "http://localhost:3100");
  vi.stubEnv("CONTROLHUB_BFF_SECURE_COOKIES", "false");
}

function sessionConfig() {
  const result = loadOperatorSessionConfig(process.env);
  if (!result.ok) throw new Error("test config invalid");
  return result.value;
}

function requestWithCookies(
  cookies: Record<string, string>,
  pathname = "/overview",
): NextRequest {
  const header = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`http://localhost:3100${pathname}`, {
    headers: header ? { cookie: header } : {},
  });
}

function assertRedirectsToLogin(response: Response, pathname = "/overview", expired = true) {
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get("location") ?? "");
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("from")).toBe(pathname);
  if (expired) {
    expect(location.searchParams.get("reason")).toBe("session-expired");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy Operator Session gate", () => {
  it("passes a valid unexpired sealed session", () => {
    stubBffEnv();
    const sealed = sealSession(
      { token: "server-token", role: "admin" },
      sessionConfig(),
    );
    const response = proxy(
      requestWithCookies({ [SESSION_COOKIE_NAME]: sealed }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects to login and marks invalid session as expired", () => {
    stubBffEnv();
    const response = proxy(
      requestWithCookies({ [SESSION_COOKIE_NAME]: "not-a-sealed-session" }),
    );
    assertRedirectsToLogin(response);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it("redirects to login for tampered ciphertext", () => {
    stubBffEnv();
    const sealed = sealSession(
      { token: "server-token", role: "admin" },
      sessionConfig(),
    );
    const parts = sealed.split(".");
    parts[3] = `${parts[3].slice(0, -2)}AA`;
    const response = proxy(
      requestWithCookies({ [SESSION_COOKIE_NAME]: parts.join(".") }),
    );
    assertRedirectsToLogin(response);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it("redirects to login for a session sealed with an unknown key", () => {
    stubBffEnv();
    const otherConfig = {
      ...sessionConfig(),
      activeKey: Buffer.from(OTHER_KEY_HEX, "hex"),
    };
    const sealed = sealSession(
      { token: "server-token", role: "admin" },
      otherConfig,
    );
    const response = proxy(
      requestWithCookies({ [SESSION_COOKIE_NAME]: sealed }),
    );
    assertRedirectsToLogin(response);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it("redirects to login for an expired session", () => {
    stubBffEnv();
    const sealed = sealSession(
      { token: "server-token", role: "admin" },
      sessionConfig(),
      Date.now() - 9 * 60 * 60 * 1000,
    );
    const response = proxy(
      requestWithCookies({ [SESSION_COOKIE_NAME]: sealed }),
    );
    assertRedirectsToLogin(response);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it("fails closed to login when BFF configuration is invalid", () => {
    stubBffEnv();
    vi.stubEnv("CONTROLHUB_BFF_SESSION_KEY", "");
    const response = proxy(
      requestWithCookies({ [SESSION_COOKIE_NAME]: "anything" }),
    );
    assertRedirectsToLogin(response);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it("rejects a browser bearer cookie at the protected page gate", () => {
    stubBffEnv();
    const response = proxy(
      requestWithCookies({ "controlhub.token": "legacy-token" }),
    );
    assertRedirectsToLogin(response, "/overview", false);
  });

  it("redirects to login when no session cookie is present", () => {
    stubBffEnv();
    const response = proxy(requestWithCookies({}));
    assertRedirectsToLogin(response, "/overview", false);
  });

  it("leaves public paths untouched", () => {
    stubBffEnv();
    for (const path of ["/login", "/api/operator-session", "/api/proxy/resources"]) {
      const response = proxy(
        new NextRequest(`http://localhost:3100${path}`),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("never leaves a valid session behind the login page: /login redirects to the console", () => {
    stubBffEnv();
    const sealed = sealSession(
      { token: "server-token", role: "admin" },
      sessionConfig(),
    );
    const response = proxy(
      requestWithCookies({ [SESSION_COOKIE_NAME]: sealed }, "/login"),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/overview",
    );
    // The session is not cleared — it is still the operator's live session.
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("clears a forged or expired session cookie presented on /login", () => {
    stubBffEnv();
    const response = proxy(
      requestWithCookies({ [SESSION_COOKIE_NAME]: "not-a-sealed-session" }, "/login"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });
});
