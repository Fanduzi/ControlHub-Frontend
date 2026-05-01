"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mapTopologyToFlow, type TopologyNodeData, type LayerBand } from "@/lib/topology-mapper";
import { getResourceTopology, TopologyNotAvailableError } from "@/services/topology";
import { cn } from "@/lib/utils";
import type { TopologyParams, TopologyResponse } from "@/types/resource";

import { NODE_TYPES } from "./topology/topology-nodes";
import { TopologyNodePopup } from "./topology/topology-node-popup";
import { TopologyProblemsPanel } from "./topology/topology-problems-panel";
import { TopologyControls } from "./topology/topology-controls";

type TopologyPanelProps = {
  resourceId: number;
  className?: string;
  compact?: boolean;
  urlSync?: boolean;
  initialTopology?: TopologyResponse | null;
};

function TopologyPanelInner({
  resourceId,
  className,
  compact = false,
  urlSync = false,
  initialTopology,
}: TopologyPanelProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();

  // --- State: URL-synced or local ---
  const urlDepth = (Number(urlParams.get("topologyDepth")) || 1) as 1 | 2;
  const urlDirection =
    (urlParams.get("topologyDirection") ?? "both") as TopologyParams["direction"];
  const urlExpanded = urlParams.get("topologyExpanded") === "1";

  const [localDepth, setLocalDepth] = useState<1 | 2>(1);
  const [localDirection, setLocalDirection] = useState<TopologyParams["direction"]>("both");
  const [localExpanded, setLocalExpanded] = useState(false);

  const depth = urlSync ? urlDepth : localDepth;
  const direction = urlSync ? urlDirection : localDirection;
  const expanded = urlSync ? urlExpanded : localExpanded;

  const [topology, setTopology] = useState<TopologyResponse | null>(initialTopology ?? null);
  const [loading, setLoading] = useState(!initialTopology);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Track params that current topology data was loaded with,
  // so we can skip re-fetching when params haven't changed.
  const loadedParamsRef = useRef<{ depth: 1 | 2; direction: string } | null>(
    initialTopology ? { depth: 1, direction: "both" } : null,
  );
  const [selectedNodePopup, setSelectedNodePopup] = useState<{
    data: TopologyNodeData;
    position: { x: number; y: number };
  } | null>(null);
  const [problemsExpanded, setProblemsExpanded] = useState(true);

  // URL update helper
  const updateUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      if (!urlSync) return;
      const params = new URLSearchParams(urlParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [urlSync, urlParams, router, pathname],
  );

  const setDepthValue = useCallback(
    (v: 1 | 2) => {
      if (urlSync) {
        updateUrlParams({ topologyDepth: String(v) });
      } else {
        setLocalDepth(v);
      }
    },
    [urlSync, updateUrlParams],
  );

  const setDirectionValue = useCallback(
    (v: string) => {
      if (urlSync) {
        updateUrlParams({ topologyDirection: v === "both" ? null : v });
      } else {
        setLocalDirection(v as TopologyParams["direction"]);
      }
    },
    [urlSync, updateUrlParams],
  );

  const setExpandedValue = useCallback(
    (v: boolean) => {
      if (urlSync) {
        updateUrlParams({ topologyExpanded: v ? "1" : null });
      } else {
        setLocalExpanded(v);
      }
    },
    [urlSync, updateUrlParams],
  );

  const fetchTopology = useCallback(
    async (d: 1 | 2, dir: TopologyParams["direction"]) => {
      setLoading(true);
      setError(null);
      setUnavailable(false);

      const queryParams: TopologyParams = {};
      if (d) queryParams.depth = d;
      if (dir && dir !== "both") queryParams.direction = dir;

      try {
        const result = await getResourceTopology(resourceId, queryParams);
        setTopology(result);
        loadedParamsRef.current = { depth: d, direction: dir ?? "both" };
      } catch (err) {
        if (err instanceof TopologyNotAvailableError) {
          setUnavailable(true);
          setTopology(null);
        } else {
          setError(t("topology.errorTitle"));
          setTopology(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [resourceId, t],
  );

  useEffect(() => {
    const loaded = loadedParamsRef.current;
    if (loaded && loaded.depth === depth && loaded.direction === direction) {
      return;
    }
    fetchTopology(depth, direction);
  }, [depth, direction, fetchTopology]);

  const flowData = useMemo(() => {
    if (!topology) return null;
    return mapTopologyToFlow(topology);
  }, [topology]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowData?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowData?.edges ?? []);
  const [layerBands, setLayerBands] = useState<LayerBand[]>([]);

  useEffect(() => {
    if (flowData) {
      setNodes(flowData.nodes);
      setEdges(flowData.edges);
      setLayerBands(flowData.layerBands);
    }
  }, [flowData, setNodes, setEdges]);

  // ESC key closes expanded mode
  useEffect(() => {
    if (!expanded) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedValue(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [expanded, setExpandedValue]);

  // Node click opens anchored detail popup
  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setSelectedNodePopup({
        data: node.data as TopologyNodeData,
        position: { x: rect.right + 12, y: rect.top },
      });
    },
    [],
  );

  const handleRetry = useCallback(() => {
    fetchTopology(depth, direction);
  }, [depth, direction, fetchTopology]);

  const hasEdges = topology && topology.edges.length > 0;
  const isDatabase = topology?.isDatabaseTopology ?? false;

  const getTypeLabel = useCallback(
    (resourceType: string): string => {
      const key = `topology.types.${resourceType}`;
      return t.has(key) ? t(key) : resourceType.replace(/_/g, " ");
    },
    [t],
  );

  const getRoleLabel = useCallback(
    (role: string): string | null => {
      const key = `topology.roles.${role}`;
      return t.has(key) ? t(key) : null;
    },
    [t],
  );

  const getEdgeTypeLabel = useCallback(
    (semanticType: string | undefined): string | null => {
      if (!semanticType) return null;
      const key = `topology.edgeTypes.${semanticType}`;
      return t.has(key) ? t(key) : null;
    },
    [t],
  );

  const highlightNode = useCallback(
    (nodeId: number) => {
      const normalizedNodeId = String(nodeId);
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          className: n.id === normalizedNodeId ? "ring-2 ring-primary/50" : undefined,
        })),
      );
    },
    [setNodes],
  );

  // Build edges with localized semantic labels
  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const semanticType = (
          edge.data as { semanticType?: string } | undefined
        )?.semanticType;
        const semanticLabel = getEdgeTypeLabel(semanticType);
        if (semanticLabel && isDatabase) {
          return { ...edge, label: semanticLabel };
        }
        return edge;
      }),
    [edges, getEdgeTypeLabel, isDatabase],
  );

  // Layer band labels
  const renderLayerBands = () => {
    if (!isDatabase || layerBands.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
        {layerBands.map((band) => {
          const label = t.has(band.labelKey) ? t(band.labelKey) : band.layerKey;
          return (
            <span
              key={band.layerKey}
              className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {label}
            </span>
          );
        })}
      </div>
    );
  };

  // ReactFlow graph renderer
  const renderGraph = (graphClassName?: string) => (
    <div
      data-testid="topology-graph"
      className={cn(
        "rounded-lg border border-border bg-card",
        expanded ? "h-full rounded-none border-0" : compact ? "h-64" : "h-[500px]",
        graphClassName,
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background gap={16} size={1} className="!bg-background" />
        <Controls
          showInteractive={false}
          className="!border-border !bg-card !shadow-sm [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-foreground [&>button:hover]:!bg-accent"
        />
      </ReactFlow>
      {renderLayerBands()}
    </div>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {!expanded && (
        <TopologyControls
          depth={depth}
          direction={direction ?? "both"}
          expanded={false}
          hasEdges={!!hasEdges}
          onDepthChange={setDepthValue}
          onDirectionChange={setDirectionValue}
          onExpandedChange={setExpandedValue}
        />
      )}

      {loading && (
        <div data-testid="topology-loading" className="space-y-3">
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      )}

      {error && !loading && (
        <div
          data-testid="topology-error"
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card py-12"
        >
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            {t("common.actions.tryAgain")}
          </Button>
        </div>
      )}

      {unavailable && !loading && (
        <div
          data-testid="topology-unavailable"
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-12"
        >
          <p className="text-sm font-medium text-muted-foreground">
            {t("topology.unavailableTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("topology.unavailableDescription")}
          </p>
        </div>
      )}

      {!loading && !error && !unavailable && topology && !hasEdges && (
        <div
          data-testid="topology-empty"
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-12"
        >
          <p className="text-sm font-medium text-muted-foreground">
            {t("topology.emptyTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("topology.emptyDescription")}
          </p>
        </div>
      )}

      {!loading && !error && !unavailable && topology && topology.problems && topology.problems.length > 0 && (
        <TopologyProblemsPanel
          problems={topology.problems}
          expanded={problemsExpanded}
          onToggle={() => setProblemsExpanded(!problemsExpanded)}
          onHighlightNode={highlightNode}
        />
      )}

      {!loading && !error && !unavailable && hasEdges && !expanded && renderGraph()}

      {/* Expanded fullscreen overlay */}
      {expanded && !loading && !error && !unavailable && hasEdges && (
        <div
          data-testid="topology-expanded-overlay"
          className="fixed inset-0 z-50 flex flex-col bg-background"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">{t("topology.title")}</span>
              <TopologyControls
                depth={depth}
                direction={direction ?? "both"}
                expanded={true}
                hasEdges={!!hasEdges}
                onDepthChange={setDepthValue}
                onDirectionChange={setDirectionValue}
                onExpandedChange={setExpandedValue}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedValue(false)}
              data-testid="topology-exit-expanded"
            >
              {t("topology.collapseButton")}
            </Button>
          </div>
          <div className="px-4 pt-2">
            {topology.problems && topology.problems.length > 0 && (
              <TopologyProblemsPanel
                problems={topology.problems}
                expanded={problemsExpanded}
                onToggle={() => setProblemsExpanded(!problemsExpanded)}
                onHighlightNode={highlightNode}
              />
            )}
          </div>
          <div className="flex-1">{renderGraph()}</div>
        </div>
      )}

      {/* Node detail popup */}
      {selectedNodePopup && (
        <TopologyNodePopup
          data={selectedNodePopup.data}
          position={selectedNodePopup.position}
          onClose={() => setSelectedNodePopup(null)}
          onNavigate={(path) => router.push(path)}
          getRoleLabel={getRoleLabel}
          getTypeLabel={getTypeLabel}
        />
      )}
    </div>
  );
}

/** TopologyPanel renders a resource topology graph with optional URL-synced controls. */
export function TopologyPanel(props: TopologyPanelProps) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
      <TopologyPanelInner {...props} />
    </Suspense>
  );
}
