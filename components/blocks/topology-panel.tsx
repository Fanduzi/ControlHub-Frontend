// input: topology services, URL state, localized messages, and graph data
// output: URL-synchronized resource/environment topology graph presentation with stale-request protection
// pos: reusable topology graph panel for console resource views
// note: if this file changes, update this header and module README.md.
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
import { getEnvironmentTopology, getResourceTopology, TopologyNotAvailableError } from "@/services/topology";
import { cn } from "@/lib/utils";
import { parsePositiveDecimalInteger } from "@/lib/list-page-search-params";
import type { TopologyParams, TopologyResponse } from "@/types/resource";

import { NODE_TYPES } from "./topology/topology-nodes";
import { TopologyNodePopup } from "./topology/topology-node-popup";
import { TopologyProblemsPanel } from "./topology/topology-problems-panel";
import {
  TOPOLOGY_RELATION_TYPES,
  TopologyControls,
} from "./topology/topology-controls";

type TopologyPanelProps = {
  resourceId?: number;
  environmentId?: number;
  className?: string;
  compact?: boolean;
  urlSync?: boolean;
  initialTopology?: TopologyResponse | null;
};

function TopologyPanelInner({
  resourceId,
  environmentId,
  className,
  compact = false,
  urlSync = false,
  initialTopology,
}: TopologyPanelProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const isEnvironmentTopology = environmentId !== undefined;

  // --- State: URL-synced or local ---
  const defaultDepth = isEnvironmentTopology ? 2 : 1;
  const urlDepthCandidate = parsePositiveDecimalInteger(urlParams.get("topologyDepth") ?? undefined);
  const urlDepth = urlDepthCandidate && urlDepthCandidate <= (isEnvironmentTopology ? 4 : 2)
    ? urlDepthCandidate
    : defaultDepth;
  const urlDirection =
    (urlParams.get("topologyDirection") ?? "both") as TopologyParams["direction"];
  const urlRelationType = urlParams.get("topologyRelationType");
  const parsedUrlRelationType = TOPOLOGY_RELATION_TYPES.includes(
    urlRelationType as (typeof TOPOLOGY_RELATION_TYPES)[number],
  ) ? urlRelationType as (typeof TOPOLOGY_RELATION_TYPES)[number] : undefined;
  const urlExpanded = urlParams.get("topologyExpanded") === "1";
  const urlRootResourceId = parsePositiveDecimalInteger(urlParams.get("rootId") ?? undefined);

  const [localDepth, setLocalDepth] = useState(defaultDepth);
  const [localDirection, setLocalDirection] = useState<TopologyParams["direction"]>("both");
  const [localRelationType, setLocalRelationType] = useState<string>();
  const [localExpanded, setLocalExpanded] = useState(false);

  const depth = urlSync ? urlDepth : localDepth;
  const direction = urlSync ? urlDirection : localDirection;
  const relationType = urlSync ? parsedUrlRelationType : localRelationType;
  const expanded = urlSync ? urlExpanded : localExpanded;
  const rootResourceId = urlRootResourceId;
  const topologyScope = environmentId !== undefined
    ? `environment:${environmentId}`
    : `resource:${resourceId ?? ""}`;

  const [topology, setTopology] = useState<TopologyResponse | null>(initialTopology ?? null);
  const [loading, setLoading] = useState(!initialTopology);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Track params that current topology data was loaded with,
  // so we can skip re-fetching when params haven't changed.
  const loadedParamsRef = useRef<string | null>(
    initialTopology ? `${topologyScope}::${defaultDepth}:both:` : null,
  );
  const topologyRequestGeneration = useRef(0);
  const topologyRequestController = useRef<AbortController | null>(null);
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
    (v: number) => {
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

  const setRelationTypeValue = useCallback(
    (v: string) => {
      const value = v && v !== "all" ? v : null;
      if (urlSync) {
        updateUrlParams({ topologyRelationType: value });
      } else {
        setLocalRelationType(value ?? undefined);
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

  const setRootResourceId = useCallback(
    (value: number | undefined) => {
      updateUrlParams({ rootId: value ? String(value) : null });
    },
    [updateUrlParams],
  );

  const fetchTopology = useCallback(
    async (d: number, dir: TopologyParams["direction"], rel?: string) => {
      const generation = topologyRequestGeneration.current + 1;
      topologyRequestGeneration.current = generation;
      topologyRequestController.current?.abort();
      const controller = new AbortController();
      topologyRequestController.current = controller;
      setLoading(true);
      setError(null);
      setUnavailable(false);

      try {
        const result = environmentId !== undefined
          ? await getEnvironmentTopology(environmentId, {
              ...(rootResourceId ? { rootResourceId } : {}),
              depth: d,
            }, { signal: controller.signal })
          : await getResourceTopology(resourceId!, {
              depth: d as 1 | 2,
              ...(dir && dir !== "both" ? { direction: dir } : {}),
              ...(rel ? { relationType: rel } : {}),
            }, { signal: controller.signal });
        if (controller.signal.aborted || generation !== topologyRequestGeneration.current) return;
        setTopology(result);
        loadedParamsRef.current = `${topologyScope}:${rootResourceId ?? ""}:${d}:${dir ?? "both"}:${rel ?? ""}`;
      } catch (err) {
        if (controller.signal.aborted || generation !== topologyRequestGeneration.current) return;
        if (err instanceof TopologyNotAvailableError) {
          setUnavailable(true);
          setTopology(null);
        } else {
          setError(t(isEnvironmentTopology ? "topology.environmentErrorTitle" : "topology.errorTitle"));
          setTopology(null);
        }
      } finally {
        if (!controller.signal.aborted && generation === topologyRequestGeneration.current) {
          setLoading(false);
        }
      }
    },
    [environmentId, isEnvironmentTopology, resourceId, rootResourceId, t, topologyScope],
  );

  useEffect(() => {
    const loadKey = `${topologyScope}:${rootResourceId ?? ""}:${depth}:${direction ?? "both"}:${relationType ?? ""}`;
    if (loadedParamsRef.current === loadKey) {
      return;
    }
    fetchTopology(depth, direction, relationType);
  }, [depth, direction, fetchTopology, relationType, rootResourceId, topologyScope]);

  useEffect(() => () => topologyRequestController.current?.abort(), []);

  const isCandidateWorkspace = isEnvironmentTopology && !rootResourceId;
  const workspaceCandidates = useMemo(() => {
    if (!topology) return [];
    if (topology.candidates && topology.candidates.length > 0) {
      return topology.candidates;
    }
    return topology.nodes;
  }, [topology]);

  const flowData = useMemo(() => {
    if (!topology || isCandidateWorkspace) return null;
    return mapTopologyToFlow(topology);
  }, [isCandidateWorkspace, topology]);

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
      if (isEnvironmentTopology) {
        setRootResourceId(Number((node.data as TopologyNodeData).id));
      }
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setSelectedNodePopup({
        data: node.data as TopologyNodeData,
        position: { x: rect.right + 12, y: rect.top },
      });
    },
    [isEnvironmentTopology, setRootResourceId],
  );

  const handleRetry = useCallback(() => {
    fetchTopology(depth, direction, relationType);
  }, [depth, direction, fetchTopology, relationType]);

  const hasEdges = !!topology && topology.edges.length > 0;
  const hasNodes = !!topology && topology.nodes.length > 0;
  const hasGraphContent = !isCandidateWorkspace && (hasNodes || hasEdges);
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

  const renderEnvironmentControls = (inExpanded = false) => (
    <div className="flex flex-wrap items-center gap-3">
      {workspaceCandidates.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("topology.rootLabel")}
          <select
            data-testid="topology-root-select"
            value={rootResourceId ?? ""}
            onChange={(event) => setRootResourceId(event.target.value ? Number(event.target.value) : undefined)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">{t("topology.allRoots")}</option>
            {workspaceCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.displayName || candidate.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        {t("topology.depthLabel")}
        <select
          data-testid="topology-environment-depth-select"
          value={depth}
          onChange={(event) => setDepthValue(Number(event.target.value))}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {!inExpanded && hasEdges && (
        <Button variant="outline" size="sm" onClick={() => setExpandedValue(true)} data-testid="topology-expand-button">
          {t("topology.expandButton")}
        </Button>
      )}
    </div>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {!expanded && (
        isEnvironmentTopology ? renderEnvironmentControls() : <TopologyControls
            depth={depth as 1 | 2}
            direction={direction ?? "both"}
            relationType={relationType}
            expanded={false}
            hasEdges={!!hasEdges}
            onDepthChange={setDepthValue}
            onDirectionChange={setDirectionValue}
            onRelationTypeChange={setRelationTypeValue}
            onExpandedChange={setExpandedValue}
          />
      )}

      {!loading && !error && topology?.truncated && (
        <p data-testid="topology-truncated" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-200">
          {t("topology.truncated")}
        </p>
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

      {!loading && !error && !unavailable && topology && isCandidateWorkspace && (
        <div
          data-testid="topology-candidate-workspace"
          className="rounded-lg border border-dashed border-border bg-card px-4 py-6"
        >
          <p className="text-sm font-medium text-foreground">
            {t("topology.candidateTitle")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("topology.candidateDescription")}
          </p>
          {workspaceCandidates.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("topology.candidateEmpty")}</p>
          ) : (
            <ul className="mt-4 space-y-1">
              {workspaceCandidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    data-testid={`topology-candidate-${candidate.id}`}
                    onClick={() => setRootResourceId(candidate.id)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  >
                    {candidate.displayName || candidate.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && !error && !unavailable && topology && !isCandidateWorkspace && !hasGraphContent && (
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

      {!loading && !error && !unavailable && hasGraphContent && !expanded && renderGraph()}

      {/* Expanded fullscreen overlay */}
      {expanded && !loading && !error && !unavailable && hasGraphContent && (
        <div
          data-testid="topology-expanded-overlay"
          className="fixed inset-0 z-50 flex flex-col bg-background"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">{t("topology.title")}</span>
              {isEnvironmentTopology ? renderEnvironmentControls(true) : <TopologyControls
                  depth={depth as 1 | 2}
                  direction={direction ?? "both"}
                  relationType={relationType}
                  expanded={true}
                  hasEdges={!!hasEdges}
                  onDepthChange={setDepthValue}
                  onDirectionChange={setDirectionValue}
                  onRelationTypeChange={setRelationTypeValue}
                  onExpandedChange={setExpandedValue}
                />}
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
