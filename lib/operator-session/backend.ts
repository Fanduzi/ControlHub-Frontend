// input: none (server-side env only)
// output: server-side BFF login against the existing backend login API with generic outcome mapping and identity
// pos: BFF-only translation from console credentials to a Backend Bearer Credential, never exposed to browsers
// note: if this file changes, update header and lib/operator-session/README.md
export type LoginOutcome =
  | {
      ok: true;
      token: string;
      role: string;
      email: string;
      displayName?: string;
    }
  | { ok: false; kind: "invalid-credentials" }
  | { ok: false; kind: "backend-unavailable" };

const BACKEND_LOGIN_TIMEOUT_MS = 10_000;

/**
 * Server-side backend base URL. Read directly from the server environment:
 * the shared client resolver branches on `typeof window`, which is a
 * jsdom/browser artifact and must not select the browser path here.
 */
export function resolveBffBackendBaseUrl(): string {
  return process.env.CONTROLHUB_API_BASE_URL || "http://localhost:8080";
}

/**
 * Call the existing backend login API server-side. Outcomes are deliberately
 * coarse: the caller maps both failure kinds to controlled console outcomes,
 * and no password, credential, or backend failure detail ever appears in an
 * outcome or log.
 */
export async function performBackendLogin(
  email: string,
  password: string,
): Promise<LoginOutcome> {
  const baseUrl = resolveBffBackendBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_LOGIN_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, kind: "backend-unavailable" };
  }

  if (response.status === 401) {
    return { ok: false, kind: "invalid-credentials" };
  }
  if (!response.ok) {
    return { ok: false, kind: "backend-unavailable" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, kind: "backend-unavailable" };
  }

  const token =
    typeof body === "object" && body !== null
      ? (body as { token?: unknown }).token
      : undefined;
  const role =
    typeof body === "object" && body !== null
      ? (body as { role?: unknown }).role
      : undefined;
  const backendEmail =
    typeof body === "object" && body !== null
      ? (body as { email?: unknown }).email
      : undefined;
  const displayName =
    typeof body === "object" && body !== null
      ? (body as { displayName?: unknown }).displayName
      : undefined;

  if (typeof token !== "string" || token.length === 0 || typeof role !== "string") {
    return { ok: false, kind: "backend-unavailable" };
  }

  return {
    ok: true,
    token,
    role,
    // A successful backend authentication binds the submitted login identity
    // to this sealed server-side session when the backend omits a display field.
    email:
      typeof backendEmail === "string" && backendEmail.length > 0
        ? backendEmail
        : email,
    ...(typeof displayName === "string" && displayName.length > 0
      ? { displayName }
      : {}),
  };
}
