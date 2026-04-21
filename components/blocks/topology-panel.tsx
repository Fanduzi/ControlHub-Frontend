"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/blocks/status-badge";
import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { mapTopologyToFlow, type TopologyNodeData, type GroupBoxData, type LayerBand } from "@/lib/topology-mapper";
import { getResourceTopology, TopologyNotAvailableError } from "@/services/topology";
import { cn } from "@/lib/utils";
import type { TopologyParams, TopologyResponse } from "@/types/resource";

// --- Role-based node styling for semantic topology ---
const ROLE_BORDER: Record<string, string> = {
  primary: "border-blue-500/50",
  replica: "border-cyan-500/50",
  replica_intermediate: "border-teal-500/50",
  cluster: "border-violet-500/50",
  application: "border-indigo-500/50",
  entry: "border-orange-500/50",
  proxy_active: "border-green-500/50",
  proxy_standby: "border-yellow-500/50",
  host: "border-slate-500/50",
  control_plane: "border-purple-500/50",
  service: "border-emerald-500/50",
};

const ROLE_BG: Record<string, string> = {
  primary: "bg-blue-500/5",
  replica: "bg-cyan-500/5",
  replica_intermediate: "bg-teal-500/5",
  cluster: "bg-violet-500/5",
  application: "bg-indigo-500/5",
  entry: "bg-orange-500/5",
  proxy_active: "bg-green-500/5",
  proxy_standby: "bg-yellow-500/5",
  host: "bg-slate-500/5",
  control_plane: "bg-purple-500/5",
  service: "bg-emerald-500/5",
};

type TopologyPanelProps = {
  resourceId: string;
  className?: string;
  compact?: boolean;
  /** When true, sync depth/direction/expanded to URL searchParams. */
  urlSync?: boolean;
};

function TopologyPanelInner({
  resourceId,
  className,
  compact = false,
  urlSync = false,
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

  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // URL update helper (only used when urlSync is true)
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

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      router.push(`/resources/${node.id}`);
    },
    [router],
  );

  const handleRetry = useCallback(() => {
    fetchTopology(depth, direction);
  }, [depth, direction, fetchTopology]);

  const hasEdges = topology && topology.edges.length > 0;
  const isDatabase = topology?.isDatabaseTopology ?? false;

  // Localized type labels for topology nodes
  const getTypeLabel = useCallback(
    (resourceType: string): string => {
      const key = `topology.types.${resourceType}`;
      return t.has(key) ? t(key) : resourceType.replace(/_/g, " ");
    },
    [t],
  );

  // Localized role label for semantic nodes
  const getRoleLabel = useCallback(
    (role: string): string | null => {
      const key = `topology.roles.${role}`;
      return t.has(key) ? t(key) : null;
    },
    [t],
  );

  // Localized edge semantic type label
  const getEdgeTypeLabel = useCallback(
    (semanticType: string | undefined): string | null => {
      if (!semanticType) return null;
      const key = `topology.edgeTypes.${semanticType}`;
      return t.has(key) ? t(key) : null;
    },
    [t],
  );

  // Custom node component with semantic role styling and named handles
  const nodeTypes = useMemo(
    () => ({
      topologyNode: ({ data }: { data: TopologyNodeData }) => {
        const roleLabel = getRoleLabel(data.topologyRole);
        const roleBorder = ROLE_BORDER[data.topologyRole] ?? "border-border";
        const roleBg = ROLE_BG[data.topologyRole] ?? "bg-card";
        const handleClass = "!w-2 !h-2 !bg-muted-foreground/40 !border-0";

        return (
          <div
            data-testid={`topology-node-${data.id}`}
            data-is-root={data.isRoot ? "true" : "false"}
            data-topology-role={data.topologyRole}
            className={cn(
              "relative rounded-lg border px-3 py-2 text-xs shadow-sm transition-colors",
              data.isRoot
                ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                : cn(roleBorder, roleBg),
            )}
          >
            {/* Named handles — source and target at each position for full directional flexibility */}
            <Handle type="source" position={Position.Left} id="source-left" className={handleClass} />
            <Handle type="target" position={Position.Left} id="target-left" className={handleClass} />
            <Handle type="source" position={Position.Top} id="source-top" className={handleClass} />
            <Handle type="target" position={Position.Top} id="target-top" className={handleClass} />
            <Handle type="source" position={Position.Right} id="source-right" className={handleClass} />
            <Handle type="target" position={Position.Right} id="target-right" className={handleClass} />
            <Handle type="source" position={Position.Bottom} id="source-bottom" className={handleClass} />
            <Handle type="target" position={Position.Bottom} id="target-bottom" className={handleClass} />
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {data.displayName || data.name}
              </span>
              {data.isRoot && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {t("topology.rootLabel")}
                </span>
              )}
              {roleLabel && !data.isRoot && isDatabase && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {roleLabel}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-muted-foreground">
              <span>{getTypeLabel(data.resourceType)}</span>
              {data.resourceSubtype && (
                <>
                  <span>·</span>
                  {(data.resourceType === "database_instance" ||
                    data.resourceType === "database_cluster" ||
                    data.resourceType === "database_proxy") ? (
                    <span className="inline-flex items-center gap-1">
                      <DbTypeIcon subtype={data.resourceSubtype} className="size-3" />
                      <span>{data.resourceSubtype}</span>
                    </span>
                  ) : (
                    <span>{data.resourceSubtype}</span>
                  )}
                </>
              )}
            </div>
            <div className="mt-1 flex gap-1">
              <StatusBadge
                status={data.healthStatus}
                tone="health"
                className="text-[10px]"
              />
              <StatusBadge
                status={data.lifecycleStatus}
                tone="lifecycle"
                className="text-[10px]"
              />
            </div>
          </div>
        );
      },
      topologyGroup: ({ data }: { data: GroupBoxData }) => {
        const handleClass = "!w-2 !h-2 !bg-muted-foreground/30 !border-0";

        return (
          <div className="relative h-full w-full rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/5">
            {/* Handles for group box */}
            <Handle type="source" position={Position.Left} id="source-left" className={handleClass} />
            <Handle type="target" position={Position.Left} id="target-left" className={handleClass} />
            <Handle type="source" position={Position.Top} id="source-top" className={handleClass} />
            <Handle type="target" position={Position.Top} id="target-top" className={handleClass} />
            <Handle type="source" position={Position.Right} id="source-right" className={handleClass} />
            <Handle type="target" position={Position.Right} id="target-right" className={handleClass} />
            <Handle type="source" position={Position.Bottom} id="source-bottom" className={handleClass} />
            <Handle type="target" position={Position.Bottom} id="target-bottom" className={handleClass} />
            {/* Cluster label */}
            <div className="absolute -top-3 left-3 rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {data.label}
            </div>
          </div>
        );
      },
    }),
    [t, getTypeLabel, getRoleLabel, isDatabase],
  );

  // Build edges with localized semantic labels for database topologies
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

  // --- Shared controls bar ---
  const renderControls = () => (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("topology.depthLabel")}
        </span>
        <Select
          value={String(depth)}
          onValueChange={(v) => { if (v) setDepthValue(Number(v) as 1 | 2); }}
        >
          <SelectTrigger size="sm" data-testid="topology-depth-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1" data-testid="topology-depth-1">
              1
            </SelectItem>
            <SelectItem value="2" data-testid="topology-depth-2">
              2
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("topology.directionLabel")}
        </span>
        <Select
          value={direction ?? "both"}
          onValueChange={(v) => { if (v) setDirectionValue(v); }}
        >
          <SelectTrigger size="sm" data-testid="topology-direction-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both" data-testid="topology-direction-both">
              {t("topology.directionBoth")}
            </SelectItem>
            <SelectItem value="upstream" data-testid="topology-direction-upstream">
              {t("topology.directionUpstream")}
            </SelectItem>
            <SelectItem
              value="downstream"
              data-testid="topology-direction-downstream"
            >
              {t("topology.directionDownstream")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!expanded && hasEdges && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpandedValue(true)}
          data-testid="topology-expand-button"
        >
          {t("topology.expandButton")}
        </Button>
      )}
    </div>
  );

  // Render layer band labels as a legend below the graph
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

  // --- Shared ReactFlow graph ---
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
        nodeTypes={nodeTypes}
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
      {renderControls()}

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
              {renderControls()}
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
          <div className="flex-1">{renderGraph()}</div>
        </div>
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
