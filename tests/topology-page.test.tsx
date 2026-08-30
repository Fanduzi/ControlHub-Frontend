// input: topology page URL props, environment resolver, and topology workspace mock
// output: server-route contracts for canonical environment/root topology URLs and fail-closed scopes
// pos: topology page composition regression tests
// note: if this file changes, update this header and tests/README.md.
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTranslationsMock = vi.fn();
const resolveEnvironmentSlugToIdMock = vi.fn();
const topologyWorkspaceMock = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock("@/lib/environment-params", () => ({
  resolveEnvironmentSlugToId: resolveEnvironmentSlugToIdMock,
}));

vi.mock("@/components/blocks/environment-topology-content", () => ({
  EnvironmentTopologyContent: (props: unknown) => {
    topologyWorkspaceMock(props);
    return <div data-testid="topology-workspace" />;
  },
}));

vi.mock("@/components/blocks/page-header", () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

describe("TopologyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => key);
  });

  it("resolves a canonical deep link to the backend environment and root IDs", async () => {
    resolveEnvironmentSlugToIdMock.mockResolvedValue({
      environmentSlug: "prod",
      environmentId: 7,
    });
    const { default: TopologyPage } = await import("@/app/(console)/topology/page");

    render(await TopologyPage({
      searchParams: Promise.resolve({ environment: "prod", rootId: "42" }),
    }));

    expect(resolveEnvironmentSlugToIdMock).toHaveBeenCalledWith({ environmentSlug: "prod" });
    expect(topologyWorkspaceMock).toHaveBeenCalledWith({
      environmentId: 7,
      rootResourceId: 42,
    });
  });

  it("fails closed for an unknown environment and malformed root without falling back to provider scope", async () => {
    resolveEnvironmentSlugToIdMock.mockResolvedValue(null);
    const { default: TopologyPage } = await import("@/app/(console)/topology/page");

    render(await TopologyPage({
      searchParams: Promise.resolve({ environment: "missing", rootId: "0" }),
    }));

    expect(topologyWorkspaceMock).toHaveBeenCalledWith({
      environmentId: null,
      rootResourceId: undefined,
    });
  });
});
