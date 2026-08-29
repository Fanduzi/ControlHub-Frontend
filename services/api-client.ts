// input: fetch, next/headers (server), operator-session cookie
// output: shared API client; browser and server use the same-origin BFF proxy; JSON errors and native multipart uploads
// pos: sole browser/SSR fetch helper for console data
// note: if this file changes, update this header and module README.md.
export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;
  /** Controlled Error Code from JSON `error`. Absent when the envelope omits it. */
  code?: string;

  constructor(
    status: number,
    message: string,
    details?: Record<string, string>,
    code?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

export function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // Browser requests rely on the HttpOnly BFF session; no readable bearer
    // token or legacy page-gate cookie participates in authentication.
    return "/api/proxy";
  }

  return process.env.CONTROLHUB_BFF_CONSOLE_ORIGIN || "http://localhost:3000";
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

async function getServerSessionHeaders(): Promise<Record<string, string>> {
  try {
    const { cookies } = await import("next/headers");
    const cookieHeader = (await cookies()).toString();
    return cookieHeader ? { Cookie: cookieHeader } : {};
  } catch {
    // Outside a Next.js request scope (unit tests, build) — no credentials.
  }
  return {};
}

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const isMultipart = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(`${resolveApiBaseUrl()}${typeof window === "undefined" ? `/api/proxy${path}` : path}`, {
    ...init,
    headers: {
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
      ...(typeof window === "undefined" ? await getServerSessionHeaders() : {}),
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
    const code =
      typeof errorBody?.error === "string" && errorBody.error.length > 0
        ? errorBody.error
        : undefined;
    const error = new ApiError(response.status, message, details, code);

    if (response.status === 401) {
      if (typeof window === "undefined") {
        const { redirect } = await import("next/navigation");
        redirect("/login?reason=session-expired");
      }
      // Browser requests rely on the HttpOnly BFF session. A rejected session is
      // cleared by the proxy and must return the user to the generic login flow.
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
