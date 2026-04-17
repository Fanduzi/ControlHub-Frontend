import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import type { ResourceListParams } from "@/types/resource";

const MOCK_ENVIRONMENTS = [
  { id: "10000000-0000-0000-0000-000000000001", name: "Production", slug: "prod" },
  { id: "10000000-0000-0000-0000-000000000002", name: "Staging", slug: "staging" },
  { id: "10000000-0000-0000-0000-000000000003", name: "Development", slug: "dev" },
];

const { listEnvironmentsMock } = vi.hoisted(() => ({
  listEnvironmentsMock: vi.fn(),
}));

vi.mock("@/services/settings", () => ({
  listEnvironments: listEnvironmentsMock,
}));

describe("resolveEnvironmentSlugToId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listEnvironmentsMock.mockResolvedValue(MOCK_ENVIRONMENTS);
  });

  it("resolves a known slug to the corresponding environmentId", async () => {
    const params: ResourceListParams = { environmentSlug: "prod" };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result.environmentId).toBe("10000000-0000-0000-0000-000000000001");
    expect(result.environmentSlug).toBe("prod");
  });

  it("resolves staging slug correctly", async () => {
    const params: ResourceListParams = { environmentSlug: "staging" };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result.environmentId).toBe("10000000-0000-0000-0000-000000000002");
  });

  it("returns unknown ID for an unrecognized slug", async () => {
    const params: ResourceListParams = { environmentSlug: "nonexistent" };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result.environmentId).toBe("00000000-0000-0000-0000-000000000000");
  });

  it("skips resolution when environmentSlug is absent", async () => {
    const params: ResourceListParams = { environmentId: "10000000-0000-0000-0000-000000000001" };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result.environmentId).toBe("10000000-0000-0000-0000-000000000001");
    expect(listEnvironmentsMock).not.toHaveBeenCalled();
  });

  it("skips resolution when environmentId is already set alongside slug", async () => {
    const params: ResourceListParams = {
      environmentSlug: "prod",
      environmentId: "10000000-0000-0000-0000-000000000001",
    };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result.environmentId).toBe("10000000-0000-0000-0000-000000000001");
    expect(listEnvironmentsMock).not.toHaveBeenCalled();
  });

  it("preserves all other params during resolution", async () => {
    const params: ResourceListParams = {
      environmentSlug: "dev",
      page: 2,
      pageSize: 50,
      q: "orders",
      resourceType: "service",
    };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result.environmentId).toBe("10000000-0000-0000-0000-000000000003");
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    expect(result.q).toBe("orders");
    expect(result.resourceType).toBe("service");
  });
});
