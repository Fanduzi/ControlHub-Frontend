// input: vitest, e2e/api.helpers
// output: unit tests for E2E API helpers — fixture-based auth, fail-loud without fixture env
// pos: contract tests for the E2E API helper surface
// note: if this file changes, update header and tests/services/README.md
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock global fetch before importing helpers
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Import after mocking — these are E2E helpers but we test them as unit tests
// since they use raw fetch, not the app's apiClient.
const {
  archiveTestResource,
  createTestResource,
  defaultResourceInput,
  deleteTestRelation,
  getAuthToken,
  testResourceName,
} = await import("../../e2e/api.helpers");

// The E2E helpers authenticate with provisioned per-run fixture identities
// (never the retired seeds); unit tests supply explicit fixture env.
function stubFixtureEnv() {
  vi.stubEnv("E2E_FIXTURE_ADMIN_EMAIL", "e2e-admin@unit-test.invalid");
  vi.stubEnv("E2E_FIXTURE_ADMIN_PASSWORD", "admin-pw");
  vi.stubEnv("E2E_FIXTURE_EDITOR_EMAIL", "e2e-editor@unit-test.invalid");
  vi.stubEnv("E2E_FIXTURE_EDITOR_PASSWORD", "editor-pw");
}

stubFixtureEnv();

afterEach(() => {
  vi.unstubAllEnvs();
  stubFixtureEnv();
});

const API_BASE = "http://localhost:8081";

const mockAuthResponse = () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ token: "test-token", role: "admin" }),
  });
};

describe("archiveTestResource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends POST /resources/{id}/archive with default reason", async () => {
    const archivedResource = {
      id: 1,
      resourceType: "service",
      name: "e2e-test",
      archivedAt: "2026-04-15T12:00:00Z",
      archiveReason: "e2e cleanup",
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(archivedResource),
    });

    const result = await archiveTestResource("test-token", 1);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resources/1/archive`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "e2e cleanup" }),
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(result.id).toBe(1);
  });

  it("sends POST /resources/{id}/archive with custom reason", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 2, archiveReason: "custom reason" }),
    });

    await archiveTestResource("test-token", 2, "custom reason");

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resources/2/archive`,
      expect.objectContaining({
        body: JSON.stringify({ reason: "custom reason" }),
      }),
    );
  });

  it("returns archived resource with archiveReason", async () => {
    const archivedResource = {
      id: 1,
      resourceType: "service",
      name: "e2e-test",
      archivedAt: "2026-04-15T12:00:00Z",
      archiveReason: "e2e cleanup",
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(archivedResource),
    });

    const result = await archiveTestResource("test-token", 1);

    expect(result.id).toBe(1);
    expect((result as Record<string, unknown>).archivedAt).toBe("2026-04-15T12:00:00Z");
    expect((result as Record<string, unknown>).archiveReason).toBe("e2e cleanup");
  });

  it("throws on error response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("internal error"),
    });

    await expect(
      archiveTestResource("test-token", 1),
    ).rejects.toThrow("returned 500");
  });

  it("encodes resource ID in URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 999 }),
    });

    await archiveTestResource("test-token", 999);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resources/999/archive`,
      expect.anything(),
    );
  });
});

describe("deleteTestRelation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends DELETE /resource-relations/{id}", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    await deleteTestRelation("test-token", 1);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resource-relations/1`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });
});

describe("getAuthToken", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns token from login API", async () => {
    mockAuthResponse();

    const token = await getAuthToken();

    expect(token).toBe("test-token");
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/auth/login`,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("e2e-admin@unit-test.invalid"),
      }),
    );
  });

  it("throws on failed login", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("unauthorized"),
    });

    await expect(getAuthToken()).rejects.toThrow("returned 401");
  });

  it("fails loud without fixture env — no seed fallback", async () => {
    vi.unstubAllEnvs();

    await expect(getAuthToken()).rejects.toThrow(/E2E_FIXTURE_ADMIN_EMAIL/);
  });
});

describe("testResourceName", () => {
  it("generates name with e2e prefix and suite", () => {
    const name = testResourceName("sheet");
    expect(name).toMatch(/^e2e-sheet-[a-z0-9]+-[a-z0-9]+$/);
  });

  it("generates unique names", () => {
    const name1 = testResourceName("topo");
    const name2 = testResourceName("topo");
    expect(name1).not.toBe(name2);
  });
});

describe("defaultResourceInput", () => {
  it("provides sensible defaults", () => {
    const input = defaultResourceInput({ name: "test-res" });
    expect(input.resourceType).toBe("service");
    expect(input.lifecycleStatus).toBe("running");
    expect(input.healthStatus).toBe("healthy");
    expect(input.name).toBe("test-res");
  });

  it("allows overrides", () => {
    const input = defaultResourceInput({
      name: "test-res",
      resourceType: "host",
      lifecycleStatus: "stopped",
    });
    expect(input.resourceType).toBe("host");
    expect(input.lifecycleStatus).toBe("stopped");
    expect(input.name).toBe("test-res");
  });
});

describe("createTestResource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends POST /resources with correct payload", async () => {
    const created = {
      id: 101,
      resourceType: "service",
      name: "e2e-sheet-abc",
      displayName: "e2e-sheet-abc",
      environmentId: 1,
      ownerId: 1,
      lifecycleStatus: "running",
      healthStatus: "healthy",
      source: "manual",
      resourceSubtype: "e2e-test",
      externalId: "",
      labels: {},
      createdAt: "2026-04-15T00:00:00Z",
      updatedAt: "2026-04-15T00:00:00Z",
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(created),
    });

    const input = defaultResourceInput({ name: "e2e-sheet-abc" });
    const result = await createTestResource("test-token", input);

    expect(result.id).toBe(101);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resources`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });
});
