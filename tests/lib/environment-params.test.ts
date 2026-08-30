// input: vitest, environment params resolver, mocked settings service
// output: resolver tests including explicit all, audit scopes, and fail-closed unknown environment slugs
// pos: shared environment URL-scope unit tests
// note: if this file changes, update header and tests/lib/README.md
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import type { ResourceListParams } from "@/types/resource";
import type { AuditEventListParams } from "@/types/audit";

const MOCK_ENVIRONMENTS = [
  { id: 1, name: "Production", slug: "prod" },
  { id: 2, name: "Staging", slug: "staging" },
  { id: 3, name: "Development", slug: "dev" },
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

    expect(result?.environmentId).toBe(1);
    expect(result?.environmentSlug).toBe("prod");
  });

  it("resolves staging slug correctly", async () => {
    const params: ResourceListParams = { environmentSlug: "staging" };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result?.environmentId).toBe(2);
  });

  it("returns no scope for an unrecognized slug", async () => {
    const params: ResourceListParams = { environmentSlug: "nonexistent" };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result).toBeNull();
  });

  it("treats the all sentinel as an explicit unscoped request", async () => {
    const params: ResourceListParams = {
      environmentSlug: "all",
      environmentId: 2,
      page: 3,
    };

    await expect(resolveEnvironmentSlugToId(params)).resolves.toEqual({ page: 3 });
    expect(listEnvironmentsMock).not.toHaveBeenCalled();
  });

  it("skips resolution when environmentSlug is absent", async () => {
    const params: ResourceListParams = { environmentId: 1 };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result?.environmentId).toBe(1);
    expect(listEnvironmentsMock).not.toHaveBeenCalled();
  });

  it("skips resolution when environmentId is already set alongside slug", async () => {
    const params: ResourceListParams = {
      environmentSlug: "prod",
      environmentId: 1,
    };
    const result = await resolveEnvironmentSlugToId(params);

    expect(result?.environmentId).toBe(1);
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

    expect(result?.environmentId).toBe(3);
    expect(result?.page).toBe(2);
    expect(result?.pageSize).toBe(50);
    expect(result?.q).toBe("orders");
    expect(result?.resourceType).toBe("service");
  });

  it("resolves audit slugs to numeric environment IDs without dropping filters", async () => {
    const params: AuditEventListParams = {
      environmentSlug: "prod",
      page: 2,
      eventType: "resource.updated",
    };

    await expect(resolveEnvironmentSlugToId(params)).resolves.toEqual({
      ...params,
      environmentId: 1,
    });
  });
});
