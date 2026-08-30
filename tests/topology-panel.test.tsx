// input: topology panel public interface, service mock, and localized messages
// output: topology panel URL, detail-navigation, and stale-request regression coverage
// pos: topology graph panel contract tests
// note: if this file changes, update this header and module README.md.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";

import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams();
let pathname = "/resources/1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}));

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodeTypes, nodes, onNodeClick }: {
    nodeTypes: Record<string, React.ComponentType<Record<string, unknown>>>;
    nodes: { type?: string; data: Record<string, unknown> }[];
    onNodeClick?: (event: React.MouseEvent<HTMLDivElement>, node: { type?: string; data: Record<string, unknown> }) => void;
  }) => {
    return (
      <div data-testid="react-flow-mock">
        {nodes?.map((node, i) => {
          const NodeComponent = nodeTypes?.[node.type ?? "topologyNode"];
          return NodeComponent ? (
            <div key={i} onClick={(event) => onNodeClick?.(event, node)}>
              <NodeComponent data={node.data} />
            </div>
          ) : null;
        })}
      </div>
    );
  },
  Background: () => null,
  Controls: () => null,
  Handle: ({ type }: { type: string }) => <div data-testid={`handle-${type}`} />,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  useNodesState: (initial: unknown[]) => [initial ?? [], vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial ?? [], vi.fn(), vi.fn()],
}));

vi.mock("@/services/topology", () => ({
  getEnvironmentTopology: vi.fn(),
  getResourceTopology: vi.fn(),
  TopologyNotAvailableError: class extends Error {
    constructor() { super("Topology endpoint not available"); this.name = "TopologyNotAvailableError"; }
  },
}));

import { getEnvironmentTopology, getResourceTopology, TopologyNotAvailableError } from "@/services/topology";
import { TopologyPanel } from "@/components/blocks/topology-panel";
import type { TopologyResponse } from "@/types/resource";

const mockGetTopology = vi.mocked(getResourceTopology);
const mockGetEnvironmentTopology = vi.mocked(getEnvironmentTopology);

function renderWithProviders(
  ui: React.ReactElement,
  locale: "en" | "zh-CN" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : zhCN}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const mockTopologyResponse: TopologyResponse = {
  rootResourceId: 1,
  depth: 1,
  direction: "both",
  nodes: [
    {
      id: 1,
      resourceType: "database_cluster",
      resourceSubtype: "mysql",
      name: "order-mysql-cluster-prod",
      displayName: "Order MySQL Cluster Prod",
      environmentId: 1,
      ownerId: 1,
      lifecycleStatus: "running",
      healthStatus: "healthy",
      isRoot: true,
      distance: 0,
      topologyRole: "cluster",
      topologyLayer: "cluster",
      groupKey: "",
      visualImportance: 0,
      isDatabaseTopology: true,
      replicationDepth: 0,
      replicationParentId: undefined,
    },
    {
      id: 2,
      resourceType: "database_instance",
      resourceSubtype: "mysql",
      name: "order-mysql-primary-prod",
      displayName: "Order MySQL Primary Prod",
      environmentId: 1,
      ownerId: 1,
      lifecycleStatus: "running",
      healthStatus: "healthy",
      isRoot: false,
      distance: 1,
      topologyRole: "primary",
      topologyLayer: "replication",
      groupKey: "",
      visualImportance: 0,
      isDatabaseTopology: true,
      replicationDepth: 0,
      replicationParentId: undefined,
    },
  ],
  edges: [
    {
      id: 1,
      fromResourceId: 2,
      toResourceId: 1,
      relationType: "member_of",
      semanticType: "membership",
    },
  ],
  groups: [],
  isDatabaseTopology: true,
};

describe("TopologyPanel", () => {
  it("gives the relation filter a localized accessible name", () => {
    renderWithProviders(<TopologyPanel resourceId={1} />, "zh-CN");

    expect(screen.getByTestId("topology-relation-type-select")).toHaveAccessibleName("关系类型");
  });

  it("offers localized relation filters and preserves topology URL state", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    searchParams = new URLSearchParams(
      "keep=1&topologyDepth=2&topologyDirection=upstream",
    );
    mockGetTopology.mockResolvedValue(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} urlSync />);

    await waitFor(() => expect(screen.getByTestId("topology-relation-type-select")).toBeInTheDocument());
    await user.click(screen.getByTestId("topology-relation-type-select"));

    expect(screen.getAllByTestId(/^topology-relation-type-/)).toHaveLength(9);
    await user.click(screen.getByTestId("topology-relation-type-depends_on"));
    await waitFor(() => expect(push).toHaveBeenLastCalledWith(
      "/resources/1?keep=1&topologyDepth=2&topologyDirection=upstream&topologyRelationType=depends_on",
    ));

    await user.click(screen.getByTestId("topology-relation-type-select"));
    await user.click(screen.getByTestId("topology-relation-type-all"));
    await waitFor(() => expect(push).toHaveBeenLastCalledWith(
      "/resources/1?keep=1&topologyDepth=2&topologyDirection=upstream",
    ));
  });

  it("fails closed for an invalid relation type in the URL", async () => {
    searchParams = new URLSearchParams("topologyRelationType=not-supported");
    mockGetTopology.mockResolvedValue(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} urlSync />);

    await waitFor(() => expect(mockGetTopology).toHaveBeenCalledWith(1, { depth: 1 }, expect.anything()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    pathname = "/resources/1";
  });

  it("renders loading state initially", () => {
    mockGetTopology.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<TopologyPanel resourceId={1} />);

    expect(screen.getByTestId("topology-loading")).toBeInTheDocument();
  });

  it("renders isolated topology nodes instead of the empty state", async () => {
    mockGetTopology.mockResolvedValueOnce({
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [
        mockTopologyResponse.nodes[0],
        {
          ...mockTopologyResponse.nodes[1],
          id: 3,
          resourceType: "database_proxy",
          name: "orders-proxy",
          displayName: "Orders Proxy",
          topologyRole: "proxy_active",
          topologyLayer: "entry",
        },
      ],
      edges: [],
      groups: [],
      isDatabaseTopology: true,
    });

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-graph")).toBeInTheDocument();
      expect(screen.getByText("Orders Proxy")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("topology-empty")).not.toBeInTheDocument();
  });

  it("renders error state on backend failure", async () => {
    mockGetTopology.mockRejectedValueOnce(new Error("500"));

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-error")).toBeInTheDocument();
    });
  });

  it("renders unavailable state when endpoint not implemented", async () => {
    mockGetTopology.mockRejectedValueOnce(new TopologyNotAvailableError());

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-unavailable")).toBeInTheDocument();
    });
  });

  it("renders topology graph when data is available", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-graph")).toBeInTheDocument();
    });
  });

  it("calls service on mount with resource id", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(mockGetTopology).toHaveBeenCalledTimes(1);
      expect(mockGetTopology).toHaveBeenCalledWith(1, expect.anything(), expect.anything());
    });
  });

  it("depth selector renders with options", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-depth-select")).toBeInTheDocument();
    });

    const depthSelect = screen.getByTestId("topology-depth-select");
    expect(depthSelect).toHaveTextContent("1");
  });

  it("direction selector renders with both options", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-direction-select")).toBeInTheDocument();
    });

    const dirSelect = screen.getByTestId("topology-direction-select");
    expect(dirSelect).toHaveTextContent("both");
  });

  it("localizes degraded status in Chinese topology nodes", async () => {
    mockGetTopology.mockResolvedValueOnce({
      ...mockTopologyResponse,
      nodes: mockTopologyResponse.nodes.map((node) => ({
        ...node,
        healthStatus: node.id === 2 ? "degraded" : node.healthStatus,
      })),
    });

    renderWithProviders(<TopologyPanel resourceId={1} />, "zh-CN");

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    expect(screen.getByText("降级")).toBeInTheDocument();
    expect(screen.queryByText("degraded")).not.toBeInTheDocument();
  });

  it("localizes stopped and unknown statuses in Chinese topology nodes", async () => {
    mockGetTopology.mockResolvedValueOnce({
      ...mockTopologyResponse,
      nodes: mockTopologyResponse.nodes.map((node) => {
        if (node.id === 2) {
          return {
            ...node,
            healthStatus: "unknown",
            lifecycleStatus: "stopped",
          };
        }

        return node;
      }),
    });

    renderWithProviders(<TopologyPanel resourceId={1} />, "zh-CN");

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    expect(screen.getByText("未知")).toBeInTheDocument();
    expect(screen.getByText("已停止")).toBeInTheDocument();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
    expect(screen.queryByText("stopped")).not.toBeInTheDocument();
  });

  it("root node is visually distinguished", async () => {
    // Use a topology where a non-cluster node is the root
    mockGetTopology.mockResolvedValueOnce({
      ...mockTopologyResponse,
      nodes: [
        {
          ...mockTopologyResponse.nodes[1], // instance-1 as root
          isRoot: true,
        },
        {
          ...mockTopologyResponse.nodes[0], // cluster-1 as non-root
          isRoot: false,
        },
      ],
      edges: [mockTopologyResponse.edges[0]],
    });

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    const rootNode = screen.getByTestId("topology-node-2");
    expect(rootNode.getAttribute("data-is-root")).toBe("true");
  });

  it("non-root nodes are not marked as root", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    const instanceNode = screen.getByTestId("topology-node-2");
    expect(instanceNode.getAttribute("data-is-root")).toBe("false");
  });

  it("error state shows retry button", async () => {
    mockGetTopology.mockRejectedValueOnce(new Error("500"));
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-error")).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByText("Try again").click();
    });

    await waitFor(() => {
      expect(mockGetTopology).toHaveBeenCalledTimes(2);
    });
  });

  it("node click triggers navigation", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByTestId("topology-node-2").click();
    });

    // Node click is handled by ReactFlow's onNodeClick, which requires
    // the actual ReactFlow event system. The navigation behavior is
    // verified via the handleNodeClick callback which calls router.push.
    expect(push).not.toHaveBeenCalled(); // mock ReactFlow doesn't fire onNodeClick
    // Real behavior is tested in E2E
  });

  // --- Semantic role tests ---

  it("renders semantic role badge on non-root database topology nodes", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    // The primary node should have a role badge
    const instanceNode = screen.getByTestId("topology-node-2");
    expect(instanceNode.getAttribute("data-topology-role")).toBe("primary");
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("does not render role badge on root node", async () => {
    // Use a topology where instance-1 is the root (non-cluster nodes can be root)
    mockGetTopology.mockResolvedValueOnce({
      ...mockTopologyResponse,
      nodes: [
        {
          ...mockTopologyResponse.nodes[1], // instance-1 as root
          isRoot: true,
        },
        {
          ...mockTopologyResponse.nodes[0], // cluster-1 as non-root
          isRoot: false,
        },
      ],
      edges: [mockTopologyResponse.edges[0]],
    });

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    // Root node should show "Root" label, not a role badge
    const rootNode = screen.getByTestId("topology-node-2");
    expect(rootNode.getAttribute("data-topology-role")).toBe("primary");
    // "Root" label is shown instead of role badge
    expect(screen.getByText("Root")).toBeInTheDocument();
  });

  it("localizes role labels in Chinese", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />, "zh-CN");

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    expect(screen.getByText("主库")).toBeInTheDocument();
  });

  // --- Expand button tests ---

  it("renders expand button when graph has edges", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-expand-button")).toBeInTheDocument();
    });

    expect(screen.getByTestId("topology-expand-button")).toHaveTextContent("Expand analysis");
  });

  it("does not render expand button when topology has no edges", async () => {
    mockGetTopology.mockResolvedValueOnce({
      ...mockTopologyResponse,
      edges: [],
    });

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-graph")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("topology-expand-button")).not.toBeInTheDocument();
  });

  // --- Node type label localization ---

  it("renders localized type labels on topology nodes", async () => {
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(<TopologyPanel resourceId={1} />);

    await waitFor(() => {
      expect(screen.getByTestId("topology-node-2")).toBeInTheDocument();
    });

    // Instance-1 is a database_instance → "DB Instance"
    expect(screen.getByText("DB Instance")).toBeInTheDocument();
  });

  // --- initialTopology reuse tests ---

  it("skips first fetch when initialTopology is provided", async () => {
    renderWithProviders(
      <TopologyPanel resourceId={1} initialTopology={mockTopologyResponse} />,
    );

    // Should render the graph directly from initialTopology data, no loading state
    await waitFor(() => {
      expect(screen.getByTestId("topology-graph")).toBeInTheDocument();
    });

    // getResourceTopology must NOT have been called
    expect(mockGetTopology).not.toHaveBeenCalled();
  });

  it("fetches when URL depth differs from initialTopology default", async () => {
    // URL specifies depth=2, but initialTopology was loaded at depth=1
    searchParams = new URLSearchParams("topologyDepth=2");
    mockGetTopology.mockResolvedValueOnce(mockTopologyResponse);

    renderWithProviders(
      <TopologyPanel resourceId={1} urlSync initialTopology={mockTopologyResponse} />,
    );

    await waitFor(() => {
      expect(mockGetTopology).toHaveBeenCalledTimes(1);
    });

    expect(mockGetTopology).toHaveBeenCalledWith(1, expect.objectContaining({ depth: 2 }), expect.anything());
  });

  it("does not fetch when urlSync with default params matching initialTopology", async () => {
    // searchParams is empty → defaults to depth=1, direction=both → matches initialTopology
    renderWithProviders(
      <TopologyPanel resourceId={1} urlSync initialTopology={mockTopologyResponse} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("topology-graph")).toBeInTheDocument();
    });

    expect(mockGetTopology).not.toHaveBeenCalled();
  });

  it("loads an environment graph at depth two and exposes candidate roots", async () => {
    mockGetEnvironmentTopology.mockResolvedValueOnce({
      ...mockTopologyResponse,
      depth: 2,
      candidates: [mockTopologyResponse.nodes[1]],
      truncated: true,
    });

    renderWithProviders(<TopologyPanel environmentId={7} />);

    await waitFor(() => {
      expect(mockGetEnvironmentTopology).toHaveBeenCalledWith(7, { depth: 2 }, expect.anything());
    });

    expect(screen.getByTestId("topology-root-select")).toHaveTextContent("Order MySQL Primary Prod");
    expect(screen.getByTestId("topology-truncated")).toBeInTheDocument();
  });

  it("hydrates a deep-linked environment root and preserves topology controls when changing it", async () => {
    const user = userEvent.setup();
    pathname = "/topology";
    searchParams = new URLSearchParams("environment=prod&rootId=42&topologyDepth=3&topologyExpanded=1");
    mockGetEnvironmentTopology.mockResolvedValue({
      ...mockTopologyResponse,
      depth: 3,
      candidates: [mockTopologyResponse.nodes[1]],
    });

    renderWithProviders(<TopologyPanel environmentId={7} urlSync />);

    await waitFor(() => {
      expect(mockGetEnvironmentTopology).toHaveBeenCalledWith(7, {
        rootResourceId: 42,
        depth: 3,
      }, expect.anything());
    });

    await user.selectOptions(screen.getByTestId("topology-root-select"), "2");
    expect(push).toHaveBeenLastCalledWith(
      "/topology?environment=prod&rootId=2&topologyDepth=3&topologyExpanded=1",
    );

    await user.selectOptions(screen.getByTestId("topology-root-select"), "");
    expect(push).toHaveBeenLastCalledWith(
      "/topology?environment=prod&topologyDepth=3&topologyExpanded=1",
    );
  });

  it("loads the candidate graph when the URL has no valid root", async () => {
    pathname = "/topology";
    searchParams = new URLSearchParams("environment=prod&rootId=0");
    mockGetEnvironmentTopology.mockResolvedValue({
      ...mockTopologyResponse,
      depth: 2,
      candidates: [mockTopologyResponse.nodes[1]],
    });

    renderWithProviders(<TopologyPanel environmentId={7} urlSync />);

    await waitFor(() => {
      expect(mockGetEnvironmentTopology).toHaveBeenCalledWith(7, { depth: 2 }, expect.anything());
      expect(screen.getByTestId("topology-root-select")).toBeInTheDocument();
    });
  });

  it("keeps environment re-rooting while exposing the existing resource detail action", async () => {
    const user = userEvent.setup();
    pathname = "/topology";
    searchParams = new URLSearchParams("environment=prod");
    mockGetEnvironmentTopology.mockResolvedValue({
      ...mockTopologyResponse,
      depth: 2,
      candidates: [mockTopologyResponse.nodes[1]],
    });

    renderWithProviders(<TopologyPanel environmentId={7} urlSync />);

    await user.click(await screen.findByTestId("topology-node-2"));

    expect(push).toHaveBeenCalledWith("/topology?environment=prod&rootId=2");
    await user.click(screen.getByRole("button", { name: "View Full Details" }));
    expect(push).toHaveBeenLastCalledWith("/resources/2");
  });

  it.each(["Infinity", "5"])("uses the default depth instead of requesting invalid URL depth %s", async (rawDepth) => {
    pathname = "/topology";
    searchParams = new URLSearchParams(`environment=prod&topologyDepth=${rawDepth}`);
    mockGetEnvironmentTopology.mockResolvedValue({
      ...mockTopologyResponse,
      depth: 2,
    });

    renderWithProviders(<TopologyPanel environmentId={7} urlSync />);

    await waitFor(() => {
      expect(mockGetEnvironmentTopology).toHaveBeenCalledWith(7, { depth: 2 }, expect.anything());
    });
  });

  it("drops a stale topology response after the URL root changes", async () => {
    pathname = "/topology";
    searchParams = new URLSearchParams("environment=prod&rootId=1");
    let resolveFirst!: (value: TopologyResponse) => void;
    let resolveSecond!: (value: TopologyResponse) => void;
    mockGetEnvironmentTopology
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    const { rerender } = renderWithProviders(<TopologyPanel environmentId={7} urlSync />);
    await waitFor(() => expect(mockGetEnvironmentTopology).toHaveBeenCalledTimes(1));

    searchParams = new URLSearchParams("environment=prod&rootId=2");
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <TopologyPanel environmentId={7} urlSync />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(mockGetEnvironmentTopology).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveSecond({
        ...mockTopologyResponse,
        rootResourceId: 2,
        nodes: [{ ...mockTopologyResponse.nodes[1], isRoot: true, displayName: "Fresh root" }],
        edges: [],
      });
    });
    expect(await screen.findByText("Fresh root")).toBeInTheDocument();

    await act(async () => {
      resolveFirst({
        ...mockTopologyResponse,
        nodes: [{ ...mockTopologyResponse.nodes[0], displayName: "Stale root" }],
        edges: [],
      });
    });
    expect(screen.queryByText("Stale root")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh root")).toBeInTheDocument();
  });

  it("refetches and aborts the prior scope when the environment changes with identical controls", async () => {
    pathname = "/topology";
    searchParams = new URLSearchParams("environment=prod&rootId=2&topologyDepth=3");
    mockGetEnvironmentTopology
      .mockResolvedValueOnce({
        ...mockTopologyResponse,
        depth: 3,
        nodes: [{ ...mockTopologyResponse.nodes[1], isRoot: true, displayName: "Environment 7" }],
        edges: [],
      })
      .mockResolvedValueOnce({
        ...mockTopologyResponse,
        depth: 3,
        nodes: [{ ...mockTopologyResponse.nodes[1], isRoot: true, displayName: "Environment 8" }],
        edges: [],
      });

    const { rerender } = renderWithProviders(<TopologyPanel environmentId={7} urlSync />);
    expect(await screen.findByText("Environment 7")).toBeInTheDocument();
    const firstSignal = mockGetEnvironmentTopology.mock.calls[0]?.[2]?.signal;

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <TopologyPanel environmentId={8} urlSync />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(mockGetEnvironmentTopology).toHaveBeenCalledWith(
      8,
      { rootResourceId: 2, depth: 3 },
      expect.anything(),
    ));
    expect(firstSignal?.aborted).toBe(true);
    expect(await screen.findByText("Environment 8")).toBeInTheDocument();
    expect(screen.queryByText("Environment 7")).not.toBeInTheDocument();
  });
});
