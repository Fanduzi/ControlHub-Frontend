import http from "node:http";

const TARGET_ORIGIN = process.env.PLAYWRIGHT_PROXY_TARGET ?? "http://localhost:8080";
const PORT = Number(process.env.PLAYWRIGHT_PROXY_PORT ?? "8081");

// No permission rewriting: every capability flag (run/explain/export) reaches
// the browser exactly as the fixture backend emits it. R1 removed the former
// export=true injection on GET /query-targets — the disposable fixture
// backend grants the CSV affordance itself from each target's own
// resolver-verified credential, while production keeps export=false.
//
// Diagnostics (sanitized): /__health exposes the run identity for the spec's
// fail-loud fixture check, and /__recorded-requests keeps bounded per-path
// metadata (method, timestamp, expectedVersion, worksheet count, credential
// hash, browser/node hop) for OCC forensics — never bodies, SQL, pins, or
// secrets. __reset-recorded-requests clears a path's records between runs.
//
// Cancel forwarding: a downstream close before the response finishes aborts
// the in-flight upstream fetch, so a browser abort propagates browser → BFF →
// this proxy → backend. A close AFTER response.end() is ordinary socket
// teardown and never counts as a cancel. /__cancel-forwarding is the
// test-only negative control: POST {"enabled":false} stops passing the abort
// signal upstream so a spec can prove the positive cancel acceptance depends
// on real propagation; it is never reachable in production.
let cancelForwardingEnabled = true;

const recordedRequests = new Map();

export function getAllowedOrigins() {
  return (
    process.env.PLAYWRIGHT_PROXY_ALLOWED_ORIGINS ??
    "http://localhost:3000,http://localhost:3100"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function resolveCorsOrigin(requestOrigin) {
  if (!requestOrigin) return null;
  return getAllowedOrigins().includes(requestOrigin) ? requestOrigin : null;
}

function setCorsHeaders(request, response) {
  const allowedOrigin = resolveCorsOrigin(request.headers.origin);
  if (allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Credentials", "true");
  }
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(request, response);

  if (!request.url) {
    response.writeHead(400).end("Missing URL");
    return;
  }

  const incomingUrl = new URL(request.url, `http://localhost:${PORT}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  if (incomingUrl.pathname === "/__health") {
    // Run-identity document: lets a spec prove this listener is THIS run's E2E
    // proxy (started by playwright with E2E_RUN_ID in env) and that it forwards
    // to the expected backend — not a stale or developer instance that happens
    // to hold the port (issue #121/#122 real-assembly requirement).
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        kind: "controlhub-e2e-api-proxy",
        runId: process.env.E2E_RUN_ID ?? null,
        target: TARGET_ORIGIN,
        cancelForwarding: cancelForwardingEnabled,
      }),
    );
    return;
  }

  if (incomingUrl.pathname === "/__cancel-forwarding") {
    if (request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      let enabled = true;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        enabled = parsed.enabled !== false;
      } catch {
        enabled = true;
      }
      cancelForwardingEnabled = enabled;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, cancelForwardingEnabled }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ cancelForwardingEnabled }));
    return;
  }

  if (incomingUrl.pathname === "/__recorded-requests") {
    const key = incomingUrl.searchParams.get("path") ?? "";
    const body = recordedRequests.get(key) ?? [];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
    return;
  }

  if (incomingUrl.pathname === "/__reset-recorded-requests") {
    const key = incomingUrl.searchParams.get("path") ?? "";
    if (key) {
      recordedRequests.set(key, []);
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const targetUrl = new URL(`${TARGET_ORIGIN}${incomingUrl.pathname}${incomingUrl.search}`);

  // Downstream-close → upstream-abort wiring: a response 'close' while the
  // response is still unfinished means the peer vanished mid-flight, so the
  // in-flight upstream fetch must stop too (browser → BFF → proxy → backend
  // propagation). After response.end() the same 'close' event is ordinary
  // socket teardown and the guard leaves the completed exchange alone.
  // (The request 'close' event cannot be used here: IncomingMessage emits
  // 'close' when the body stream finishes, which would abort every POST
  // upstream the moment its upload completes.)
  const upstreamAbort = new AbortController();
  const onDownstreamClose = () => {
    if (!response.writableEnded) upstreamAbort.abort();
  };
  response.on("close", onDownstreamClose);

  try {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

  // Record topology requests under the key "/resources/*/topology"
  // so tests can verify depth/direction/relationType params.
  const isTopology = incomingUrl.pathname.match(/^\/resources\/[^/]+\/topology$/);
  const recordKey =
    incomingUrl.pathname === "/resources" ? "/resources" :
    incomingUrl.pathname === "/audit-events" ? "/audit-events" :
    incomingUrl.pathname === "/query-workspace" ? "/query-workspace" :
    isTopology ? "/resources/*/topology" : null;

  if (recordKey) {
    const nextRequest = {
      pathname: incomingUrl.pathname,
      search: incomingUrl.search,
      searchParams: Object.fromEntries(incomingUrl.searchParams.entries()),
      method: request.method,
      at: Date.now(),
      // Sender discriminator for cross-page forensics: stable hash of the
      // Authorization credential (never the credential itself).
      ...(recordKey === "/query-workspace"
        ? (() => {
            const auth = request.headers.authorization ?? "";
            let hash = 0;
            for (const ch of auth) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
            const referer = request.headers.referer ?? "";
            return {
              sender: `s${(hash >>> 0).toString(36)}`,
              via: referer.includes(":3100") ? "browser" : "node",
            };
          })()
        : {}),
      // Workspace OCC forensics: expectedVersion + worksheet count only — the
      // full snapshot (SQL, pins) is intentionally not captured.
      ...(recordKey === "/query-workspace" && body
        ? (() => {
            try {
              const parsed = JSON.parse(body.toString("utf8"));
              return {
                expectedVersion: parsed.expectedVersion,
                worksheetCount: Array.isArray(parsed.worksheets)
                  ? parsed.worksheets.length
                  : null,
              };
            } catch {
              return {};
            }
          })()
        : {}),
    };
    const currentRequests = recordedRequests.get(recordKey) ?? [];
    recordedRequests.set(recordKey, [...currentRequests, nextRequest]);
  }

    try {
      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: Object.fromEntries(
          Object.entries(request.headers)
            .filter(([key, value]) => key.toLowerCase() !== "host" && value !== undefined)
            .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]),
        ),
        body,
        duplex: body ? "half" : undefined,
        // The signal governs the whole upstream exchange — connect, header
        // wait, AND the arrayBuffer() body read — so a downstream close at any
        // stage stops upstream work instead of only before headers arrive.
        signal: cancelForwardingEnabled ? upstreamAbort.signal : undefined,
      });

      if (recordKey === "/query-workspace") {
        const log = recordedRequests.get(recordKey) ?? [];
        const last = log[log.length - 1];
        if (last && last.status === undefined) last.status = upstreamResponse.status;
      }

      const headers = Object.fromEntries(upstreamResponse.headers.entries());
      delete headers["access-control-allow-origin"];
      delete headers["access-control-allow-credentials"];
      delete headers["access-control-allow-headers"];
      delete headers["access-control-allow-methods"];
      setCorsHeaders(request, response);
      const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());

      // A peer that disappeared while the upstream body was being read gets
      // no write: the socket is dead, not merely unflushed. Do NOT check
      // request.destroyed here — a normally-consumed request stream is also
      // "destroyed" in Node semantics and would kill every response.
      if (upstreamAbort.signal.aborted || response.destroyed || response.writableEnded) {
        return;
      }

      response.writeHead(upstreamResponse.status, headers);
      response.end(upstreamBody);
    } catch (error) {
      // Never write an error document to a dead downstream socket, and never
      // surface a client-triggered upstream abort as a proxy failure.
      if (
        upstreamAbort.signal.aborted ||
        response.destroyed ||
        response.writableEnded
      ) {
        return;
      }
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Proxy request failed",
        }),
      );
    }
  } catch {
    // The request body read aborted or record/fetch setup threw outside the
    // inner try. Same dead-socket rule: never write to a gone peer.
    if (
      upstreamAbort.signal.aborted ||
      response.destroyed ||
      response.writableEnded
    ) {
      return;
    }
    if (!response.headersSent) {
      response.writeHead(502, { "Content-Type": "application/json" });
    }
    response.end(JSON.stringify({ error: "Proxy request failed" }));
  } finally {
    response.off("close", onDownstreamClose);
  }
});

export { server };

function startServer() {
  server.listen(PORT, () => {
    console.log(`Playwright API proxy listening on http://localhost:${PORT}`);
  });
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  startServer();
}
