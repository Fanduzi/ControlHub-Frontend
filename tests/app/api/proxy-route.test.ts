import http from "node:http";
import type { AddressInfo } from "node:net";

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
  vi.restoreAllMocks();
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

  it("returns 499 without any upstream call for an already-aborted inbound signal", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, []);
    const controller = new AbortController();
    controller.abort();

    const response = await GET(
      new NextRequest("http://localhost:3100/api/proxy/resources", {
        method: "GET",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sealedCookieValue()}` },
        signal: controller.signal,
      }),
      routeContext(["resources"]),
    );
    expect(response.status).toBe(499);
    expect(fetchMock).not.toHaveBeenCalled();
    // A bare cancel status: no error vocabulary, no credential echo.
    expect(await response.text()).not.toContain(TOKEN);
  });

  it("propagates a mid-flight inbound abort to the upstream fetch signal", async () => {
    stubBffEnv();
    let upstreamSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const responsePromise = GET(
      new NextRequest("http://localhost:3100/api/proxy/resources", {
        method: "GET",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sealedCookieValue()}` },
        signal: controller.signal,
      }),
      routeContext(["resources"]),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();

    // The composite upstream signal — not the raw inbound one — fires.
    expect(upstreamSignal).toBeInstanceOf(AbortSignal);
    expect(upstreamSignal?.aborted).toBe(true);
    const response = await responsePromise;
    // Client cancel is reported as 499, not mislabeled as a backend outage.
    expect(response.status).toBe(499);
    expect(await response.text()).not.toContain("service-unavailable");
    expect(await response.text()).not.toContain(TOKEN);
  });

  it("maps an upstream-side abort with no inbound cancel to 503, not 499", async () => {
    stubBffEnv();
    let upstreamSignal: AbortSignal | undefined;
    let rejectUpstream: ((error: unknown) => void) | undefined;
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        rejectUpstream = reject;
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("timed out", "TimeoutError")),
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const responsePromise = GET(
      proxyRequest("GET", ["resources"], {
        cookie: sealedCookieValue(),
        origin: null,
      }),
      routeContext(["resources"]),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // The 30s server-side backstop lives on the same composite signal: when it
    // fires, the inbound signal is NOT aborted, so the outcome is the coded
    // service-unavailable envelope — a client cancel would have been 499.
    expect(upstreamSignal).toBeInstanceOf(AbortSignal);
    rejectUpstream?.(new DOMException("timed out", "TimeoutError"));
    const response = await responsePromise;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "service_unavailable",
      message: "service-unavailable",
    });
  });
});

// A real local HTTP upstream whose handler writes the response head plus a
// partial body and then stalls — this is the only faithful way to exercise
// "headers received, body still streaming" (a fetch stub that rejects cannot
// reach the response-body phase at all).
type StreamingUpstream = {
  url: string;
  handlerSawRequest: () => boolean;
  drop: () => void;
  close: () => Promise<void>;
};

function listenStreamingUpstream(
  behavior: "hang" | "drop-after-partial",
): Promise<StreamingUpstream> {
  let sawRequest = false;
  let liveResponse: http.ServerResponse | undefined;
  const server = http.createServer((_req, res) => {
    sawRequest = true;
    liveResponse = res;
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"partial":');
    if (behavior === "drop-after-partial") {
      setImmediate(() => res.socket?.destroy());
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        handlerSawRequest: () => sawRequest,
        drop: () => liveResponse?.socket?.destroy(),
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

describe("BFF proxy full-exchange error boundary", () => {
  it("returns 499 when the client cancels while the upstream response body is still streaming", async () => {
    stubBffEnv();
    const upstream = await listenStreamingUpstream("hang");
    vi.stubEnv("CONTROLHUB_API_BASE_URL", upstream.url);
    const controller = new AbortController();
    try {
      const responsePromise = GET(
        new NextRequest("http://localhost:3100/api/proxy/resources", {
          method: "GET",
          headers: { cookie: `${SESSION_COOKIE_NAME}=${sealedCookieValue()}` },
          signal: controller.signal,
        }),
        routeContext(["resources"]),
      );
      await vi.waitFor(() => expect(upstream.handlerSawRequest()).toBe(true));
      // The response head is already in flight; only the body read remains —
      // the same abort boundary must classify this leg, not leak it to the
      // framework as an unhandled 500.
      controller.abort();
      const response = await responsePromise;
      expect(response.status).toBe(499);
      expect(await response.text()).not.toContain(TOKEN);
    } finally {
      await upstream.close();
    }
  });

  it("maps an upstream socket drop mid response-body to the coded 503 envelope", async () => {
    stubBffEnv();
    const upstream = await listenStreamingUpstream("drop-after-partial");
    vi.stubEnv("CONTROLHUB_API_BASE_URL", upstream.url);
    try {
      const response = await GET(
        proxyRequest("GET", ["resources"], {
          cookie: sealedCookieValue(),
          origin: null,
        }),
        routeContext(["resources"]),
      );
      expect(upstream.handlerSawRequest()).toBe(true);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "service_unavailable",
        message: "service-unavailable",
      });
    } finally {
      await upstream.close();
    }
  });

  it("maps the server-side timeout firing during the response-body read to 503", async () => {
    stubBffEnv();
    const upstream = await listenStreamingUpstream("hang");
    vi.stubEnv("CONTROLHUB_API_BASE_URL", upstream.url);
    // Shorten ONLY the backstop leg the route composes; the mechanism is the
    // production AbortSignal.timeout, not a second cancellation channel.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(80));
    try {
      const response = await GET(
        proxyRequest("GET", ["resources"], {
          cookie: sealedCookieValue(),
          origin: null,
        }),
        routeContext(["resources"]),
      );
      // Inbound was never cancelled — a body-read timeout is a backend-side
      // failure and keeps the coded envelope (a client cancel would be 499).
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "service_unavailable",
        message: "service-unavailable",
      });
    } finally {
      await upstream.close();
    }
  });

  function streamingBodyRequest(
    signal?: AbortSignal,
  ): { request: NextRequest; stream: ReadableStreamDefaultController<Uint8Array> } {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const request = new NextRequest(
      "http://localhost:3100/api/proxy/resources",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sealedCookieValue()}`,
          origin: ORIGIN,
          "content-type": "application/json",
        },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
          },
        }),
        // Node's Request requires half-duplex for stream bodies.
        ...({ duplex: "half" } as { duplex: "half" }),
        ...(signal ? { signal } : {}),
      },
    );
    return { request, stream };
  }

  it("returns 499 with zero upstream calls when the inbound upload aborts mid-body", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, []);
    const controller = new AbortController();
    const { request, stream } = streamingBodyRequest(controller.signal);
    const responsePromise = POST(request, routeContext(["resources"]));
    // Simulate the socket teardown a real client disconnect causes while the
    // BFF is still buffering the upload: abort the inbound signal and error
    // the request stream the way the platform would.
    await vi.waitFor(() => expect(stream.desiredSize).not.toBeNull());
    controller.abort();
    stream.error(new Error("client reset"));
    const response = await responsePromise;
    expect(response.status).toBe(499);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(TOKEN);
  });

  it("returns the coded 503 when the inbound upload stream fails without a client cancel", async () => {
    stubBffEnv();
    const fetchMock = stubUpstream(200, []);
    const { request, stream } = streamingBodyRequest();
    const responsePromise = POST(request, routeContext(["resources"]));
    await vi.waitFor(() => expect(stream.desiredSize).not.toBeNull());
    stream.error(new Error("upload stream reset"));
    const response = await responsePromise;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "service_unavailable",
      message: "service-unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
