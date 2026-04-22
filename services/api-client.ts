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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
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
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
