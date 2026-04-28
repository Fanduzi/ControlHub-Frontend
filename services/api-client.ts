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

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const token = window.sessionStorage.getItem("controlhub.token");

  if (!token) {
    return {};
  }

  return { Authorization: `Bearer ${token}` };
}

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
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

    if (response.status === 401 && typeof window !== "undefined") {
      window.sessionStorage.removeItem("controlhub.token");
      document.cookie = "controlhub.token=; path=/; max-age=0";
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
