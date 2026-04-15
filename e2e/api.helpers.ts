/**
 * Playwright API helpers for authenticated backend requests.
 *
 * All calls go through the api-proxy (localhost:8081) so they are
 * recorded the same way as browser-initiated requests.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8081";

// ── Types ────────────────────────────────────────────────────────────

type Resource = {
  id: string;
  resourceType: string;
  name: string;
  displayName: string;
  environmentId: string;
  ownerId: string;
  lifecycleStatus: string;
  healthStatus: string;
  source: string;
  resourceSubtype: string;
  externalId: string;
  labels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type ResourceRelation = {
  id: string;
  fromResourceId: string;
  toResourceId: string;
  relationType: string;
  createdAt: string;
};

type CreateResourceInput = {
  resourceType: string;
  resourceSubtype?: string;
  name: string;
  displayName: string;
  environmentId: string;
  ownerId: string;
  lifecycleStatus: string;
  healthStatus: string;
  source: string;
  externalId?: string;
  labels?: Record<string, string>;
};

type CreateRelationInput = {
  toResourceId: string;
  relationType: string;
};

// ── Auth ─────────────────────────────────────────────────────────────

const TEST_EMAIL = "admin@example.com";
const TEST_PASSWORD = "secret123";

export async function getAuthToken(): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`Login API returned ${res.status}: ${await res.text()}`);
  }

  const { token } = (await res.json()) as { token: string; role: string };
  return token;
}

// ── Generic authenticated fetch ──────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init: RequestInit & { token: string },
): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...rest.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API ${rest.method ?? "GET"} ${path} returned ${res.status}: ${await res.text()}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

// ── Resource helpers ─────────────────────────────────────────────────

export async function createTestResource(
  token: string,
  input: CreateResourceInput,
): Promise<Resource> {
  return apiFetch<Resource>("/resources", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export async function getTestResource(
  token: string,
  id: string,
): Promise<Resource | null> {
  try {
    return await apiFetch<Resource>(`/resources/${encodeURIComponent(id)}`, {
      token,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    throw error;
  }
}

export async function updateTestResource(
  token: string,
  id: string,
  patch: Partial<CreateResourceInput>,
): Promise<Resource> {
  return apiFetch<Resource>(`/resources/${encodeURIComponent(id)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(patch),
  });
}

// ── Relation helpers ─────────────────────────────────────────────────

export async function createTestRelation(
  token: string,
  fromResourceId: string,
  input: CreateRelationInput,
): Promise<ResourceRelation> {
  return apiFetch<ResourceRelation>(
    `/resources/${encodeURIComponent(fromResourceId)}/relations`,
    {
      method: "POST",
      token,
      body: JSON.stringify(input),
    },
  );
}

export async function deleteTestRelation(
  token: string,
  relationId: string,
): Promise<void> {
  await apiFetch<void>(`/resource-relations/${encodeURIComponent(relationId)}`, {
    method: "DELETE",
    token,
  });
}

// ── Naming helpers ───────────────────────────────────────────────────

/**
 * Generate a unique resource name with an e2e prefix.
 * Uses timestamp + random suffix to avoid collisions across parallel workers.
 * `e2e-<suite>-<timestamp>-<random>`
 */
export function testResourceName(suite: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `e2e-${suite}-${ts}-${rand}`;
}

/**
 * Default field values for creating a test resource.
 * Override any field by passing a partial.
 */
export function defaultResourceInput(
  overrides: Partial<CreateResourceInput> & { name: string },
): CreateResourceInput {
  return {
    resourceType: "service",
    resourceSubtype: "e2e-test",
    displayName: overrides.name,
    environmentId: "10000000-0000-0000-0000-000000000001",
    ownerId: "20000000-0000-0000-0000-000000000001",
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "",
    labels: {},
    ...overrides,
  };
}
