// input: @/app/api/operator-session/route, @/lib/operator-session/*, next/server
// output: Vitest tests for the BFF login/logout route boundary (sealed HttpOnly cookie, generic outcomes)
// pos: unit-level contract tests for the Operator Session login and logout HTTP surface
// note: if this file changes, update header and tests/app/api/README.md
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DELETE, POST } from "@/app/api/operator-session/route";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/operator-session/constants";

const ACTIVE_KEY_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const ORIGIN = "http://localhost:3100";
const TOKEN = "server-issued-bearer-token";

function stubBffEnv() {
  vi.stubEnv("CONTROLHUB_BFF_SESSION_KEY", ACTIVE_KEY_HEX);
  vi.stubEnv("CONTROLHUB_BFF_CONSOLE_ORIGIN", ORIGIN);
  vi.stubEnv("CONTROLHUB_BFF_SECURE_COOKIES", "true");
  vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
}

function loginRequest(
  body: unknown = { email: "admin@example.com", password: "secret123" },
  origin: string | null = ORIGIN,
): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin !== null) headers.set("origin", origin);
  return new NextRequest("http://localhost:3100/api/operator-session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function logoutRequest(origin: string | null = ORIGIN): NextRequest {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new NextRequest("http://localhost:3100/api/operator-session", {
    method: "DELETE",
    headers,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/operator-session", () => {
  it("sets an opaque HttpOnly sealed cookie and never returns the backend credential", async () => {
    stubBffEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ token: TOKEN, role: "admin" }), {
          status: 200,
        }),
      ),
    );

    const response = await POST(loginRequest());
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ role: "admin" });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.secure).toBe(true);
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(cookie?.value).not.toContain(TOKEN);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=strict");
    expect(setCookie.toLowerCase()).toContain("secure");
    expect(setCookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
  });

  it("maps backend authentication failure to one generic unauthorized outcome", async () => {
    stubBffEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "account disabled: reason" }), {
          status: 401,
        }),
      ),
    );

    const response = await POST(loginRequest());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("unauthorized");
    expect(body).not.toContain("disabled");
    expect(body).not.toContain("reason");
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("returns a generic service-unavailable outcome when the backend is unreachable", async () => {
    stubBffEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await POST(loginRequest());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("service-unavailable");
    expect(body).not.toContain("fetch failed");
  });

  it("rejects an unsafe login from a non-configured Origin", async () => {
    stubBffEnv();
    const response = await POST(loginRequest({}, "https://evil.example"));
    expect(response.status).toBe(403);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("rejects an unsafe login with no Origin header", async () => {
    stubBffEnv();
    const response = await POST(loginRequest({}, null));
    expect(response.status).toBe(403);
  });

  it("rejects a malformed login body", async () => {
    stubBffEnv();
    const response = await POST(
      new NextRequest("http://localhost:3100/api/operator-session", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: "not-json",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a login body missing required fields", async () => {
    stubBffEnv();
    const response = await POST(loginRequest({ email: "admin@example.com" }));
    expect(response.status).toBe(400);
  });

  it("fails closed with a generic outcome when configuration is invalid", async () => {
    stubBffEnv();
    vi.stubEnv("CONTROLHUB_BFF_SESSION_KEY", "");
    const response = await POST(loginRequest());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("session-key");
    expect(body).not.toContain(ACTIVE_KEY_HEX);
  });
});

describe("DELETE /api/operator-session", () => {
  it("clears the operator session cookie", async () => {
    stubBffEnv();
    const response = await DELETE(logoutRequest());
    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.httpOnly).toBe(true);
  });

  it("rejects logout from a non-configured Origin without clearing the session", async () => {
    stubBffEnv();
    const response = await DELETE(logoutRequest("https://evil.example"));
    expect(response.status).toBe(403);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
