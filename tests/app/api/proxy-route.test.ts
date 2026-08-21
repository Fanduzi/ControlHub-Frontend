// input: @/app/api/proxy/[...path]/route, @/lib/operator-session/*, next/server
// output: Vitest tests for the protected BFF proxy boundary (server-held credential, origin and header rejection, coded synthesized errors, forwarded upstream error)
// pos: unit-level contract tests for server-side forwarding of the session-held Backend Bearer Credential
// note: if this file changes, update header and tests/app/api/README.md
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, POST } from "@/app/api/proxy/[...path]/route";
import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";
import { sealSession } from "@/lib/operator-session/seal";

const ACTIVE_KEY_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const ACTIVE_KEY_BASE64 = Buffer.from(ACTIVE_KEY_HEX, "hex").toString("base64");
const ORIGIN = "http://localhost:3100";
const TOKEN = "server-held-bearer-token";
const NOW_MS = Date.now();

function stubBffEnv() {
  vi.stubEnv("CONTROLHUB_BFF_SESSION_KEY", ACTIVE_KEY_BASE64);
  vi.stubEnv("CONTROLHUB_BFF_CONSOLE_ORIGIN", ORIGIN);
  vi.stubEnv("CONTROLHUB_BFF_SECURE_COOKIES", "false");
  vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://backend.test");
}

function sessionConfig() {
  const result = loadOperatorSessionConfig(process.env);
  if (!result.ok) throw new Error("test config invalid");
  return result.value;
}

function sealedCookieValue(overrides: { token?: string } = {}): string {
  return sealSession(
    { token: overrides.token ?? TOKEN, role: "admin" },
    sessionConfig(),
    NOW_MS,
  );
}

function proxyRequest(
  method: string,
  path: string[],
  options: {
    cookie?: string | null;
    origin?: string | null;
    authorization?: string | null;
    body?: unknown;
    contentLength?: number;
  } = {},
): NextRequest {
  const headers = new Headers({ accept: "application/json" });
  if (options.cookie !== undefined) {
    headers.set(
      "cookie",
      options.cookie === null ? "" : `${SESSION_COOKIE_NAME}=${options.cookie}`,
    );
  }
  if (options.origin !== null && options.origin !== undefined) {
    headers.set("origin", options.origin);
  }
  if (options.authorization) {
    headers.set("authorization", options.authorization);
  }
  const url = `http://localhost:3100/api/proxy/${path.join("/")}`;
  const hasBody = options.body !== undefined;
  if (hasBody) {
    headers.set("content-type", "application/json");
    if (options.contentLength !== undefined) {
      headers.set("content-length", String(options.contentLength));
    }
  }
  return new NextRequest(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
}

function routeContext(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function stubUpstream(status: number, body?: unknown) {
  const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("BFF proxy boundary", () => {
  it("forwards a protected request using only the server-held credential", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, { items: [{ id: 1 }] });

    const response = await GET(
      proxyRequest("GET", ["resources"], {
        cookie: sealedCookieValue(),
        origin: null,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ id: 1 }] });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend.test/resources");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("cookie")).toBeNull();
  });

  it("refuses to proxy auth paths that could mint a bearer for the browser", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, { token: "should-not-leak", role: "admin" });

    const response = await POST(
      proxyRequest(
        "POST",
        ["auth", "login"],
        {
          cookie: sealedCookieValue(),
          origin: ORIGIN,
          body: { email: "a@b.c", password: "x" },
        },
      ),
      routeContext(["auth", "login"]),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "not_found",
      message: "not-found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves query strings when forwarding", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, []);
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      new NextRequest("http://localhost:3100/api/proxy/resources?limit=2&page=1", {
        method: "GET",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sealedCookieValue()}` },
      }),
      routeContext(["resources"]),
    );
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend.test/resources?limit=2&page=1");
  });

  it("rejects a client-supplied Authorization header without forwarding", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, []);
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      proxyRequest("GET", ["resources"], {
        cookie: sealedCookieValue(),
        authorization: "Bearer client-token",
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "forbidden_header",
      message: "forbidden-header",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsafe request from a non-configured Origin", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, []);
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      proxyRequest("POST", ["resources"], {
        cookie: sealedCookieValue(),
        origin: "https://evil.example",
        body: { name: "x" },
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "forbidden",
      message: "forbidden",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsafe request with no Origin header", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, []);
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      proxyRequest("POST", ["resources"], {
        cookie: sealedCookieValue(),
        origin: null,
        body: { name: "x" },
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "forbidden",
      message: "forbidden",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an unsafe request from the exact configured Origin", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, { id: 9 });

    const response = await POST(
      proxyRequest("POST", ["resources"], {
        cookie: sealedCookieValue(),
        origin: ORIGIN,
        body: { name: "x" },
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend.test/resources");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(new TextDecoder().decode(init?.body as ArrayBuffer | undefined)).toContain("name");
  });

  it("returns one generic unauthorized outcome without a session", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, []);
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      proxyRequest("GET", ["resources"], { cookie: null }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "unauthorized",
      message: "unauthorized",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps an expired or invalid session to the same generic unauthorized outcome and clears the cookie", async () => {
    stubBffEnv();
    const response = await GET(
      proxyRequest("GET", ["resources"], {
        cookie: "v1.deadbeef.abc.def.ghi",
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "unauthorized",
      message: "unauthorized",
    });
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.maxAge).toBe(0);
  });

  it("maps backend 401 to a generic unauthorized outcome without leaking backend details", async () => {
    stubBffEnv();
    stubUpstream(401, { message: "token revoked: session 42" });
    const response = await GET(
      proxyRequest("GET", ["resources"], {
        cookie: sealedCookieValue(),
        origin: null,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "unauthorized", message: "unauthorized" });
    expect(JSON.stringify(body)).not.toContain("revoked");
    expect(JSON.stringify(body)).not.toContain("session 42");
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it("forwards backend 403 bodies without clearing the session", async () => {
    stubBffEnv();
    stubUpstream(403, {
      error: "query_result_disclosure_blocked",
      message: "blocked by result disclosure policy",
    });
    const response = await GET(
      proxyRequest("GET", ["resources"], {
        cookie: sealedCookieValue(),
        origin: null,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "query_result_disclosure_blocked",
      message: "blocked by result disclosure policy",
    });
    // Session cookie is not cleared on 403.
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("forwards non-auth upstream responses verbatim", async () => {
    stubBffEnv();
    stubUpstream(500, { error: "internal" });
    const response = await GET(
      proxyRequest("GET", ["resources"], {
        cookie: sealedCookieValue(),
        origin: null,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal" });
  });

  it("forwards upstream redirects with their Location header and never forwards upstream Set-Cookie or CORS headers", async () => {
    stubBffEnv();
    const fetchMock = vi.fn(async () => {
      const headers = new Headers({
        location: "http://backend.test/resources/5",
        "cache-control": "max-age=60",
        "access-control-allow-origin": "*",
        "access-control-allow-credentials": "true",
        "set-cookie": "session=evil",
      });
      return new Response(null, { status: 302, headers });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      proxyRequest("GET", ["resources"], {
        cookie: sealedCookieValue(),
        origin: null,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://backend.test/resources/5",
    );
    // Cache-Control is always overridden to no-store.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an oversized request body with 413 before forwarding", async () => {
    stubBffEnv();
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      proxyRequest("POST", ["resources"], {
        cookie: sealedCookieValue(),
        origin: ORIGIN,
        body: { name: "x" },
        contentLength: 11 * 1024 * 1024,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "payload_too_large",
      message: "payload-too-large",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a chunked body that exceeds the size cap while streaming", async () => {
    stubBffEnv();
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const oversized = "x".repeat(10 * 1024 * 1024 + 1);
    const response = await POST(
      proxyRequest("POST", ["resources"], {
        cookie: sealedCookieValue(),
        origin: ORIGIN,
        body: oversized,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "payload_too_large",
      message: "payload-too-large",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a coded service_unavailable envelope when the backend is unreachable", async () => {
    stubBffEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await GET(
      proxyRequest("GET", ["resources"], {
        cookie: sealedCookieValue(),
        origin: null,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "service_unavailable",
      message: "service-unavailable",
    });
  });

  it("passes DELETE through with the server-held credential", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(204);
    vi.stubGlobal("fetch", fetchMock);

    const response = await DELETE(
      proxyRequest("DELETE", ["resources", "5"], {
        cookie: sealedCookieValue(),
        origin: ORIGIN,
      }),
      routeContext(["resources", "5"]),
    );
    expect(response.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://backend.test/resources/5");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
  });
});
