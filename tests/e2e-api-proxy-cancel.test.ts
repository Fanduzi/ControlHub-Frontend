// input: e2e/api-proxy.mjs (exported http server), node:http, node:net
// output: socket-level tests for downstream-close → upstream-abort cancel propagation, incl. the /__cancel-forwarding negative control
// pos: vitest unit tests over real loopback sockets — no browser, no fixtures
// note: if this file changes, update header and tests/README.md
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type UpstreamState = {
  server: http.Server;
  port: number;
  /** Requests the upstream received. */
  seen: number;
  /** True once an in-flight upstream exchange ended prematurely (socket died). */
  aborted: boolean;
  /** Lets a test release a hanging handler deliberately. */
  release: (() => void) | null;
};

async function startUpstream(handler?: "hang" | "ok"): Promise<UpstreamState> {
  const state: UpstreamState = {
    server: undefined as unknown as http.Server,
    port: 0,
    seen: 0,
    aborted: false,
    release: null,
  };
  state.server = http.createServer((req, res) => {
    state.seen += 1;
    // Node semantics: response 'close' before writableFinished means the
    // connection was terminated prematurely — i.e. the proxy aborted us.
    res.on("close", () => {
      if (!res.writableFinished) state.aborted = true;
    });
    if (handler === "hang") {
      state.release = () => {
        if (res.writableFinished || res.destroyed) return;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      };
      return;
    }
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
  });
  await new Promise<void>((resolve) => state.server.listen(0, "127.0.0.1", resolve));
  state.port = (state.server.address() as AddressInfo).port;
  return state;
}

type ProxyHandle = {
  server: http.Server;
  port: number;
};

/** Import a fresh proxy module bound to the given upstream, listening on :0. */
async function startProxy(upstreamPort: number): Promise<ProxyHandle> {
  vi.resetModules();
  vi.stubEnv("PLAYWRIGHT_PROXY_TARGET", `http://127.0.0.1:${upstreamPort}`);
  vi.stubEnv("PLAYWRIGHT_PROXY_PORT", "0");
  const mod = await import("../e2e/api-proxy.mjs");
  const server = mod.server as http.Server;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

/** Send one raw HTTP request over a controllable socket. */
function rawRequest(port: number, head: string, body = ""): net.Socket {
  const socket = net.connect(port, "127.0.0.1", () => {
    socket.write(head + body);
  });
  return socket;
}

function readHttpResponse(port: number, head: string, body = ""): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(head + body);
    });
    const chunks: Buffer[] = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.on("error", reject);
  });
}

describe("e2e api-proxy downstream-cancel → upstream-abort", () => {
  let upstream: UpstreamState | null = null;
  let proxy: ProxyHandle | null = null;
  const sockets: net.Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.destroy();
    upstream?.release?.();
    if (proxy) {
      proxy.server.closeAllConnections?.();
      await new Promise((resolve) => proxy!.server.close(resolve));
    }
    if (upstream) {
      upstream.server.closeAllConnections?.();
      await new Promise((resolve) => upstream!.server.close(resolve));
    }
    upstream = null;
    proxy = null;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("a normal request completes end-to-end without a false cancel", async () => {
    upstream = await startUpstream("ok");
    proxy = await startProxy(upstream.port);
    const reply = await readHttpResponse(
      proxy.port,
      "GET /resources?limit=1 HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    );
    expect(reply).toContain("200");
    expect(reply).toContain('"ok":true');
    await sleep(50);
    expect(upstream.seen).toBe(1);
    expect(upstream.aborted).toBe(false);
  });

  it("aborts the upstream fetch when the client disconnects while upstream is pending", async () => {
    upstream = await startUpstream("hang");
    proxy = await startProxy(upstream.port);
    const socket = rawRequest(
      proxy.port,
      "POST /query-targets/7/execute HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
    );
    sockets.push(socket);
    await vi.waitFor(() => expect(upstream!.seen).toBe(1));
    socket.destroy();
    await vi.waitFor(() => expect(upstream!.aborted).toBe(true));

    // The proxy itself survives and still serves the next request.
    upstream.release?.();
    const reply = await readHttpResponse(
      proxy.port,
      "GET /__health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    );
    expect(reply).toContain("controlhub-e2e-api-proxy");
  });

  it("never reaches upstream when the client dies during the request-body read", async () => {
    upstream = await startUpstream("ok");
    proxy = await startProxy(upstream.port);
    const socket = rawRequest(
      proxy.port,
      "POST /query-targets/7/execute HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 500\r\nConnection: close\r\n\r\n{}",
    );
    sockets.push(socket);
    socket.destroy();
    await sleep(120);
    // The body read never completed → no upstream request was started.
    expect(upstream.seen).toBe(0);
  });

  it("negative control: with forwarding disabled the upstream survives a downstream disconnect", async () => {
    upstream = await startUpstream("hang");
    proxy = await startProxy(upstream.port);

    const toggle = await readHttpResponse(
      proxy.port,
      "POST /__cancel-forwarding HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 17\r\nConnection: close\r\n\r\n{\"enabled\":false}",
    );
    expect(toggle).toContain('"cancelForwardingEnabled":false');

    const socket = rawRequest(
      proxy.port,
      "POST /query-targets/7/execute HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
    );
    sockets.push(socket);
    await vi.waitFor(() => expect(upstream!.seen).toBe(1));
    socket.destroy();
    await sleep(150);
    // Forwarding blocked: the upstream exchange was NOT cancelled and can
    // still complete — this is what makes the positive browser test fail.
    expect(upstream.aborted).toBe(false);
    upstream.release?.();
    await sleep(50);
  });
});
