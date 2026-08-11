// input: fetch, next/headers (server), operator-session seal/config
// output: shared API client with browser and server credential resolution
// pos: sole browser/SSR fetch helper; server unseals BFF session or legacy token cookie
// note: if this file changes, update header and services/README.md
import {
  LEGACY_TOKEN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/operator-session/constants";

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
    return process.env.NEXT_PUBLIC_API_BASE_URL || "/__api";
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

function readLegacyTokenFromDocumentCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LEGACY_TOKEN_COOKIE_NAME}=`));
  if (!match) return null;
  const value = match.slice(LEGACY_TOKEN_COOKIE_NAME.length + 1);
  return value.length > 0 ? value : null;
}

/** Browser-only: sessionStorage first, then the legacy readable token cookie. */
function getBrowserAuthHeaders(): Record<string, string> {
  const token =
    window.sessionStorage.getItem("controlhub.token") ??
    readLegacyTokenFromDocumentCookie();

  if (!token) {
    return {};
  }

  return { Authorization: `Bearer ${token}` };
}

/**
 * Server-only: prefer the sealed BFF Operator Session cookie; fall back to the
 * legacy token cookie. Dynamic import keeps next/headers out of the client bundle.
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

    const legacy = jar.get(LEGACY_TOKEN_COOKIE_NAME)?.value;
    if (legacy) {
      return { Authorization: `Bearer ${legacy}` };
    }
  } catch {
    // Outside a Next.js request scope (unit tests, build) — no credentials.
  }
  return {};
}

async function resolveAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") {
    return getBrowserAuthHeaders();
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
      document.cookie = `${LEGACY_TOKEN_COOKIE_NAME}=; path=/; max-age=0`;
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
