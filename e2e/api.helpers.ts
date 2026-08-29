// input: @playwright/test fetch helpers, ./harness/fixtures, process env
// output: authenticated API helpers for E2E (fixture identities; exported apiFetch; no seed fallback)
// pos: server-side E2E data helpers through the api-proxy, including core CI typed-profile identity
// note: if this file changes, update header and e2e/README.md
/**
 * Playwright API helpers for authenticated backend requests.
 *
 * All calls go through the api-proxy (localhost:8081) so they are
 * recorded the same way as browser-initiated requests.
 */

import { resolveFixtureIdentity, type FixtureRole } from "./harness/fixtures";

const API_BASE =
  process.env.CONTROLHUB_API_PROXY_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8081";

// ── Types ────────────────────────────────────────────────────────────

type Resource = {
  id: number;
  resourceType: string;
  name: string;
  displayName: string;
  environmentId: number;
  ownerId: number;
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
  id: number;
  fromResourceId: number;
  toResourceId: number;
  relationType: string;
  createdAt: string;
};

type CreateResourceInput = {
  resourceType: string;
  resourceSubtype?: string;
  name: string;
  displayName: string;
  environmentId: number;
  ownerId: number;
  lifecycleStatus: string;
  healthStatus: string;
  source: string;
  externalId?: string;
  labels?: Record<string, string>;
  profile?: Record<string, string | number | boolean>;
};

type CreateRelationInput = {
  toResourceId: number;
  relationType: string;
};

// ── Auth ─────────────────────────────────────────────────────────────

export async function getAuthToken(role: FixtureRole = "admin"): Promise<string> {
  const { email, password } = resolveFixtureIdentity(role);
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Login API returned ${res.status}: ${await res.text()}`);
  }

  const { token } = (await res.json()) as { token: string; role: string };
  return token;
}

// ── Generic authenticated fetch ──────────────────────────────────────

export async function apiFetch<T>(
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
  id: number,
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
  id: number,
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
  fromResourceId: number,
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
  relationId: number,
): Promise<void> {
  await apiFetch<void>(`/resource-relations/${encodeURIComponent(relationId)}`, {
    method: "DELETE",
    token,
  });
}

// ── Archive helper ──────────────────────────────────────────────────

/**
 * Archive a test-created resource via POST /resources/{id}/archive.
 *
 * Backend Phase 12.1 provides archive semantics:
 * - archived resources are excluded from default GET /resources
 * - repeated archive is idempotent
 * - archived resources remain fetchable by ID
 */
export async function archiveTestResource(
  token: string,
  id: number,
  reason = "e2e cleanup",
): Promise<Resource> {
  return apiFetch<Resource>(
    `/resources/${encodeURIComponent(id)}/archive`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ reason }),
    },
  );
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
function defaultIdentityProfile(
  resourceType: string,
  name: string,
): Record<string, string | number | boolean> | undefined {
  switch (resourceType) {
    case "host":
      return { hostname: `${name}.internal`, ipAddress: "10.0.0.1" };
    case "database_instance":
      return { engine: "mysql", host: `${name}.internal`, port: 3306 };
    case "database_cluster":
      return { engine: "mysql", primaryEndpoint: `${name}.internal:3306` };
    case "service":
      return { systemName: name };
    default:
      return undefined;
  }
}

export function defaultResourceInput(
  overrides: Partial<CreateResourceInput> & { name: string },
): CreateResourceInput {
  const input: CreateResourceInput = {
    resourceType: "service",
    resourceSubtype: "api",
    displayName: overrides.name,
    environmentId: 1,
    ownerId: 1,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "",
    labels: {},
    ...overrides,
  };
  if (input.profile === undefined) {
    input.profile = defaultIdentityProfile(input.resourceType, input.name);
  }
  return input;
}
