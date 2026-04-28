import http from "node:http";

const TARGET_ORIGIN = process.env.PLAYWRIGHT_PROXY_TARGET ?? "http://localhost:8080";
const PORT = Number(process.env.PLAYWRIGHT_PROXY_PORT ?? "8081");

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
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
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
    isTopology ? "/resources/*/topology" : null;

  if (recordKey) {
    const nextRequest = {
      pathname: incomingUrl.pathname,
      search: incomingUrl.search,
      searchParams: Object.fromEntries(incomingUrl.searchParams.entries()),
      method: request.method,
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

    const headers = Object.fromEntries(upstreamResponse.headers.entries());
    delete headers["access-control-allow-origin"];
    delete headers["access-control-allow-credentials"];
    delete headers["access-control-allow-headers"];
    delete headers["access-control-allow-methods"];
    setCorsHeaders(request, response);
    response.writeHead(upstreamResponse.status, headers);
    const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());
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
