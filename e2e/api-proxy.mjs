import http from "node:http";

const TARGET_ORIGIN = process.env.PLAYWRIGHT_PROXY_TARGET ?? "http://localhost:8080";
const PORT = Number(process.env.PLAYWRIGHT_PROXY_PORT ?? "8081");

// T13-A E2E fixture affordance: the backend contract keeps
// availableActions.export=false on every target (OpenAPI: "all false"), so the
// CSV export control never renders against the real backend. The dedicated
// Query E2E fixture target (QUERY_DEV_TARGET_NAME, default
// "local-mysql-query-dev") gets export=true injected on GET /query-targets so
// the real download path can be exercised. This flips only the UI affordance
// flag on the disposable fixture identity — execution, matrices, and
// disclosure are untouched and remain server-produced.
const EXPORT_FLAG_RESOURCE_NAME =
  process.env.E2E_EXPORT_FLAG_RESOURCE_NAME ?? "local-mysql-query-dev";

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
      }),
    );
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
    let upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());

    // Fixture-only export-flag injection (see EXPORT_FLAG_RESOURCE_NAME).
    if (
      request.method === "GET" &&
      incomingUrl.pathname === "/query-targets" &&
      upstreamResponse.status === 200
    ) {
      try {
        const body = JSON.parse(upstreamBody.toString("utf8"));
        let touched = false;
        for (const item of body.items ?? []) {
          if (
            item &&
            item.resourceName === EXPORT_FLAG_RESOURCE_NAME &&
            item.availableActions
          ) {
            item.availableActions.export = true;
            touched = true;
          }
        }
        if (touched) {
          upstreamBody = Buffer.from(JSON.stringify(body), "utf8");
          delete headers["content-length"];
          delete headers["content-encoding"];
        }
      } catch {
        // Non-JSON list payload: pass through unchanged.
      }
    }

    response.writeHead(upstreamResponse.status, headers);
    response.end(upstreamBody);
  } catch (error) {
    response.writeHead(502, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Proxy request failed",
      }),
    );
  }
});

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
