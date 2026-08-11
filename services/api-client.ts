// input: fetch, next/headers (server), operator-session seal/config
// output: shared API client; browser uses /api/proxy, server unseals BFF session
// pos: sole browser/SSR fetch helper for console data
// note: if this file changes, update header and services/README.md
import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";

export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;

  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // Browser fetches always use the same-origin BFF proxy. The server attaches
    // the sealed Operator Session credential; clients never send Authorization.
    // (Legacy readable tokens are page-gate only until Issue #15 removes them.)
    return "/api/proxy";
  }

  return process.env.CONTROLHUB_API_BASE_URL || "http://localhost:8080";
}

function assertNoUnsafeIntegers(value: unknown) {
  if (typeof value === "number") {
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new Error("API response contains unsafe integer value");
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoUnsafeIntegers(item);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      assertNoUnsafeIntegers(nested);
    }
  }
}

/**
 * Server-only: unseal the Operator Session cookie into a Backend Bearer
 * Credential for RSC/server fetches. Dynamic import keeps next/headers out of
 * the client bundle. Legacy readable tokens are intentionally not used here —
 * they remain a temporary page-gate seam only (`proxy.ts`) until Issue #15.
 */
async function getServerAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();

    const sealed = jar.get(SESSION_COOKIE_NAME)?.value;
    if (sealed) {
      const { loadOperatorSessionConfig } = await import(
        "@/lib/operator-session/config"
      );
      const { unsealSession } = await import("@/lib/operator-session/seal");
      const config = loadOperatorSessionConfig();
      if (config.ok) {
        const unsealed = unsealSession(sealed, config.value);
        if (unsealed.ok) {
          return { Authorization: `Bearer ${unsealed.payload.token}` };
        }
      }
    }
  } catch {
    // Outside a Next.js request scope (unit tests, build) — no credentials.
  }
  return {};
}

async function resolveAuthHeaders(): Promise<Record<string, string>> {
  // Browser clients never attach Authorization; the BFF proxy owns credentials.
  if (typeof window !== "undefined") {
    return {};
  }
  return getServerAuthHeaders();
}

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // Capture whether this call actually sent a bearer credential. A 401 with no
  // credential is an unauthenticated probe (e.g. login-page environment load),
  // not a session expiry — only credentialed 401s clear the legacy token and
  // bounce to login. (BFF sealed cookies are HttpOnly and never appear here.)
  const authHeaders = await resolveAuthHeaders();
  const sentCredential = Boolean(authHeaders.Authorization);

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let errorBody: Record<string, unknown> = {};
    try {
      errorBody = await response.json();
    } catch {
      // not JSON
    }
    const message = (errorBody?.message as string) || `Request failed: ${response.status}`;
    const details = (errorBody?.details as Record<string, string>) || undefined;
    const error = new ApiError(response.status, message, details);

    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      sentCredential
    ) {
      window.sessionStorage.removeItem("controlhub.token");
      window.sessionStorage.removeItem("controlhub.role");
      document.cookie = "controlhub.token=; path=/; max-age=0";
      document.cookie = "controlhub.role=; path=/; max-age=0";
      window.location.href = "/login?reason=session-expired";
    }

    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json();
  assertNoUnsafeIntegers(payload);
  return payload as T;
}
