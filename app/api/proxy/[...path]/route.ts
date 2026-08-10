// input: next/server, @/lib/operator-session/config, @/lib/operator-session/seal, @/lib/operator-session/origin, @/lib/operator-session/constants, @/lib/operator-session/backend, @/lib/operator-session/session-cookie
// output: protected same-origin BFF proxy that forwards requests with the server-held Backend Bearer Credential
// pos: sole console-browser entry to protected backend APIs; rejects client Authorization and unsafe cross-origin requests
// note: if this file changes, update header and app/api/proxy/README.md
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveBffBackendBaseUrl } from "@/lib/operator-session/backend";
import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";
import { isUnsafeMethod, originAllowed } from "@/lib/operator-session/origin";
import { bffJson } from "@/lib/operator-session/response";
import { unsealSession } from "@/lib/operator-session/seal";
import { clearSessionCookie } from "@/lib/operator-session/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 30_000;

/** Maximum request body the BFF buffers for forwarding (10 MiB). */
const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024;

/** Request headers never forwarded upstream; the BFF owns authentication. */
const FORBIDDEN_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "accept-encoding",
  "upgrade",
  "te",
  "trailer",
]);

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Copy upstream response headers into the proxied response. Set-Cookie and
 * access-control-* headers are never forwarded: the backend must not mint
 * browser cookies or a CORS policy through the BFF. Everything else,
 * including Location on 3xx redirects, is preserved, but Cache-Control is
 * always overridden to no-store so sensitive proxied payloads are never
 * cached by browsers or intermediaries.
 */
function upstreamResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase();
    if (lower === "set-cookie" || lower.startsWith("access-control-")) {
      continue;
    }
    headers.set(name, value);
  }
  headers.set("cache-control", "no-store");
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

/**
 * Buffer the request body with a hard size cap. Content-Length is rejected
 * up front; chunked bodies are capped while streaming so an oversized upload
 * cannot exhaust BFF memory.
 */
async function readProxyBody(
  request: NextRequest,
): Promise<{ ok: true; body: Buffer | undefined } | { ok: false }> {
  if (!BODY_METHODS.has(request.method) || !request.body) {
    return { ok: true, body: undefined };
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_BODY_BYTES) {
    return { ok: false };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROXY_BODY_BYTES) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  return { ok: true, body: Buffer.concat(chunks) };
}

async function handleProxy(
  request: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const config = loadOperatorSessionConfig();
  if (!config.ok) {
    return bffJson(503, "service-unavailable");
  }

  // Authentication-source confusion guard: a client-supplied Authorization
  // header is rejected outright and never forwarded.
  if (
    request.headers.has("authorization") ||
    request.headers.has("proxy-authorization")
  ) {
    return bffJson(400, "forbidden-header");
  }

  if (
    isUnsafeMethod(request.method) &&
    !originAllowed(request, config.value.consoleOrigin)
  ) {
    return bffJson(403, "forbidden");
  }

  const sealed = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sealed) {
    return bffJson(401, "unauthorized");
  }

  const unsealed = unsealSession(sealed, config.value, Date.now());
  if (!unsealed.ok) {
    // Missing, malformed, tampered, expired, and unknown-key sessions all
    // produce the same controlled unauthenticated outcome; the rejected
    // session cookie is cleared.
    const response = bffJson(401, "unauthorized");
    clearSessionCookie(response, config.value.secureCookies);
    return response;
  }

  const incoming = new URL(request.url);
  const target = new URL(resolveBffBackendBaseUrl());
  target.pathname = `/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
  target.search = incoming.search;

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }
  // The only credential forwarded is the server-held one from the session.
  headers.set("authorization", `Bearer ${unsealed.payload.token}`);

  const bufferedBody = await readProxyBody(request);
  if (!bufferedBody.ok) {
    return bffJson(413, "payload-too-large");
  }
  const body = bufferedBody.body
    ? new Uint8Array(bufferedBody.body)
    : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ message: "service-unavailable" }, { status: 503 });
  }

  if (upstream.status === 401) {
    const response = bffJson(401, "unauthorized");
    clearSessionCookie(response, config.value.secureCookies);
    return response;
  }

  if (upstream.status === 403) {
    // A valid session without the required role keeps the session.
    return bffJson(403, "forbidden");
  }

  const responseHeaders = upstreamResponseHeaders(upstream);

  if (upstream.status === 204 || request.method === "HEAD") {
    return new NextResponse(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const upstreamBody = Buffer.from(await upstream.arrayBuffer());
  return new NextResponse(upstreamBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

async function proxy(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
): Promise<NextResponse> {
  const { path } = await ctx.params;
  return handleProxy(request, path);
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function HEAD(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function OPTIONS(
  request: NextRequest,
  ctx: RouteContext<"/api/proxy/[...path]">,
): Promise<NextResponse> {
  return proxy(request, ctx);
}
