import { beforeEach, describe, expect, it, vi } from "vitest";

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
      id: "res-1",
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

    const result = await archiveTestResource("test-token", "res-1");

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resources/res-1/archive`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "e2e cleanup" }),
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(result.id).toBe("res-1");
  });

  it("sends POST /resources/{id}/archive with custom reason", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "res-2", archiveReason: "custom reason" }),
    });

    await archiveTestResource("test-token", "res-2", "custom reason");

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resources/res-2/archive`,
      expect.objectContaining({
        body: JSON.stringify({ reason: "custom reason" }),
      }),
    );
  });

  it("returns archived resource with archiveReason", async () => {
    const archivedResource = {
      id: "res-1",
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

    const result = await archiveTestResource("test-token", "res-1");

    expect(result.id).toBe("res-1");
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
      archiveTestResource("test-token", "res-1"),
    ).rejects.toThrow("returned 500");
  });

  it("encodes resource ID in URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "res/special" }),
    });

    await archiveTestResource("test-token", "res/special");

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resources/res%2Fspecial/archive`,
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

    await deleteTestRelation("test-token", "rel-1");

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resource-relations/rel-1`,
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
      expect.objectContaining({ method: "POST" }),
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
      id: "res-new",
      resourceType: "service",
      name: "e2e-sheet-abc",
      displayName: "e2e-sheet-abc",
      environmentId: "10000000-0000-0000-0000-000000000001",
      ownerId: "20000000-0000-0000-0000-000000000001",
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

    expect(result.id).toBe("res-new");
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/resources`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });
});
