import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveBffBackendBaseUrl } from "@/lib/operator-session/backend";
import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import { authenticateCookie } from "@/lib/operator-session/facade";
import { isUnsafeMethod, originAllowed } from "@/lib/operator-session/origin";
import { bffJson } from "@/lib/operator-session/response";
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
 * The peer is gone: a bare status with no error vocabulary — there is no
 * client left to read a synthesized envelope, and no backend failure to
 * report anyway.
 */
function clientGoneResponse(): NextResponse {
  return new NextResponse(null, {
    status: 499,
    headers: { "cache-control": "no-store" },
  });
}

/** Upstream path prefixes the BFF must never forward (token-minting, etc.). */
const BLOCKED_PATH_PREFIXES = ["auth"];

function isBlockedProxyPath(path: string[]): boolean {
  const head = path[0]?.toLowerCase() ?? "";
  return BLOCKED_PATH_PREFIXES.includes(head);
}

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
  try {
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
  } catch (error) {
    // The stream already failed; best-effort cancel releases the lock.
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

async function handleProxy(
  request: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const config = loadOperatorSessionConfig();
  if (!config.ok) {
    return bffJson(503, "service-unavailable");
  }

  if (isBlockedProxyPath(path)) {
    return bffJson(404, "not-found");
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

  const session = authenticateCookie(request);
  if (!session.ok) {
    return session.response;
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
  headers.set("authorization", `Bearer ${session.payload.token}`);

  // One classification boundary covers the whole exchange — inbound body
  // buffering, the upstream fetch, and the upstream response-body read. Any
  // rejection lands here exactly once: an aborted inbound signal is the
  // client cancel (bare 499); anything else is an upstream-side failure the
  // caller can still read about (coded 503, never the raw exception).
  try {
    const bufferedBody = await readProxyBody(request);
    if (!bufferedBody.ok) {
      return bffJson(413, "payload-too-large");
    }
    const body = bufferedBody.body
      ? new Uint8Array(bufferedBody.body)
      : undefined;

    // The client vanished while its body was being buffered: the upstream
    // call must not be sent at all (a pre-send cancel is a distinct outcome
    // from a mid-flight abort).
    if (request.signal.aborted) {
      return clientGoneResponse();
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      // The 30s backstop composes with inbound cancellation instead of
      // replacing it: an already-aborted inbound signal fires the upstream
      // abort immediately, including while the response body streams.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(PROXY_TIMEOUT_MS)]),
    });

    if (upstream.status === 401) {
      const response = bffJson(401, "unauthorized");
      clearSessionCookie(response, config.value.secureCookies);
      return response;
    }

    // 403 and other non-401 statuses keep the session and forward the
    // upstream body so product messages (disclosure policy, validation,
    // etc.) survive.

    const responseHeaders = upstreamResponseHeaders(upstream);

    if (upstream.status === 204 || request.method === "HEAD") {
      return new NextResponse(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    // The composite signal stays armed through the body read: a mid-body
    // cancel or drop rejects here and is classified by the catch below,
    // never forwarded as a raw stream error.
    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(upstreamBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    if (request.signal.aborted) {
      return clientGoneResponse();
    }
    return bffJson(503, "service-unavailable");
  }
}

type ProxyRouteContext = { params: Promise<{ path: string[] }> };

async function proxy(
  request: NextRequest,
  ctx: ProxyRouteContext,
): Promise<NextResponse> {
  const { path } = await ctx.params;
  return handleProxy(request, path);
}

export async function GET(
  request: NextRequest,
  ctx: ProxyRouteContext,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function POST(
  request: NextRequest,
  ctx: ProxyRouteContext,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function PUT(
  request: NextRequest,
  ctx: ProxyRouteContext,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function PATCH(
  request: NextRequest,
  ctx: ProxyRouteContext,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function DELETE(
  request: NextRequest,
  ctx: ProxyRouteContext,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function HEAD(
  request: NextRequest,
  ctx: ProxyRouteContext,
): Promise<NextResponse> {
  return proxy(request, ctx);
}

export async function OPTIONS(
  request: NextRequest,
  ctx: ProxyRouteContext,
): Promise<NextResponse> {
  return proxy(request, ctx);
}
