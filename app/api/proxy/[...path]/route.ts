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
import { unsealSession } from "@/lib/operator-session/seal";
import { clearSessionCookie } from "@/lib/operator-session/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 30_000;

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
 * Copy upstream response headers into the proxied response. Set-Cookie is
 * never forwarded (the backend must not mint browser cookies through the
 * BFF); everything else, including Location on 3xx redirects, is preserved.
 */
function upstreamResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const [name, value] of upstream.headers) {
    if (name.toLowerCase() === "set-cookie") continue;
    headers.set(name, value);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function handleProxy(
  request: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const config = loadOperatorSessionConfig();
  if (!config.ok) {
    return NextResponse.json({ message: "service-unavailable" }, { status: 503 });
  }

  // Authentication-source confusion guard: a client-supplied Authorization
  // header is rejected outright and never forwarded.
  if (
    request.headers.has("authorization") ||
    request.headers.has("proxy-authorization")
  ) {
    return NextResponse.json({ message: "forbidden-header" }, { status: 400 });
  }

  if (
    isUnsafeMethod(request.method) &&
    !originAllowed(request, config.value.consoleOrigin)
  ) {
    return NextResponse.json({ message: "forbidden" }, { status: 403 });
  }

  const sealed = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sealed) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const unsealed = unsealSession(sealed, config.value, Date.now());
  if (!unsealed.ok) {
    // Missing, malformed, tampered, expired, and unknown-key sessions all
    // produce the same controlled unauthenticated outcome; the rejected
    // session cookie is cleared.
    const response = NextResponse.json(
      { message: "unauthorized" },
      { status: 401 },
    );
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

  const body =
    BODY_METHODS.has(request.method) && request.body
      ? await request.arrayBuffer()
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
    const response = NextResponse.json(
      { message: "unauthorized" },
      { status: 401 },
    );
    clearSessionCookie(response, config.value.secureCookies);
    return response;
  }

  if (upstream.status === 403) {
    // A valid session without the required role keeps the session.
    return NextResponse.json({ message: "forbidden" }, { status: 403 });
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
