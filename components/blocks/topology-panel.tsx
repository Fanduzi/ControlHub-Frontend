"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";
import { mapTopologyToFlow, type TopologyNodeData } from "@/lib/topology-mapper";
import { getResourceTopology, TopologyNotAvailableError } from "@/services/topology";
import { cn } from "@/lib/utils";
import type { TopologyParams, TopologyResponse } from "@/types/resource";

const HEALTH_COLORS: Record<string, string> = {
  healthy: "border-emerald-500/50 bg-emerald-500/5",
  warning: "border-amber-500/50 bg-amber-500/5",
  critical: "border-rose-500/50 bg-rose-500/5",
};

type TopologyPanelProps = {
  resourceId: string;
  className?: string;
  compact?: boolean;
};

export function TopologyPanel({ resourceId, className, compact = false }: TopologyPanelProps) {
  const t = useTranslations();
  const router = useRouter();

  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [depth, setDepth] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<TopologyParams["direction"]>("both");

  const fetchTopology = useCallback(async (params: TopologyParams) => {
    setLoading(true);
    setError(null);
    setUnavailable(false);

    const queryParams: TopologyParams = {};
    if (params.depth) queryParams.depth = params.depth;
    if (params.direction) queryParams.direction = params.direction;
    if (params.relationType) queryParams.relationType = params.relationType;

    try {
      const result = await getResourceTopology(resourceId, queryParams);
      setTopology(result);
    } catch (error) {
      if (error instanceof TopologyNotAvailableError) {
        setUnavailable(true);
        setTopology(null);
      } else {
        setError(t("topology.errorTitle"));
        setTopology(null);
      }
    } finally {
      setLoading(false);
    }
  }, [resourceId, t]);

  useEffect(() => {
    fetchTopology({ depth, direction });
  }, [depth, direction, fetchTopology]);

  const flowData = useMemo(() => {
    if (!topology) return null;
    return mapTopologyToFlow(topology);
  }, [topology]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowData?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowData?.edges ?? []);

  useEffect(() => {
    if (flowData) {
      setNodes(flowData.nodes);
      setEdges(flowData.edges);
    }
  }, [flowData, setNodes, setEdges]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    router.push(`/resources/${node.id}`);
  }, [router]);

  const handleRetry = useCallback(() => {
    fetchTopology({ depth, direction });
  }, [depth, direction, fetchTopology]);

  const hasEdges = topology && topology.edges.length > 0;

  // Custom node component rendered inline via nodeTypes
  const nodeTypes = useMemo(() => ({
    topologyNode: ({ data }: { data: TopologyNodeData }) => (
      <div
        data-testid={`topology-node-${data.id}`}
        data-is-root={data.isRoot ? "true" : "false"}
        className={cn(
          "rounded-lg border px-3 py-2 text-xs shadow-sm transition-colors",
          data.isRoot
            ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
            : "border-border bg-card",
          HEALTH_COLORS[data.healthStatus] ?? "border-border bg-card",
        )}
      >
        <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-muted-foreground/40 !border-0" />
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{data.displayName || data.name}</span>
          {data.isRoot && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {t("topology.rootLabel")}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
          <span>{data.resourceType.replace(/_/g, " ")}</span>
          {data.resourceSubtype && (
            <>
              <span>·</span>
              <span>{data.resourceSubtype}</span>
            </>
          )}
        </div>
        <div className="mt-1 flex gap-1">
          <StatusBadge status={data.healthStatus} tone="health" className="text-[10px]" />
          <StatusBadge status={data.lifecycleStatus} tone="lifecycle" className="text-[10px]" />
        </div>
        <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-muted-foreground/40 !border-0" />
      </div>
    ),
  }), [t]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("topology.depthLabel")}</span>
          <Select
            value={String(depth)}
            onValueChange={(v) => setDepth(Number(v) as 1 | 2)}
          >
            <SelectTrigger size="sm" data-testid="topology-depth-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1" data-testid="topology-depth-1">1</SelectItem>
              <SelectItem value="2" data-testid="topology-depth-2">2</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("topology.directionLabel")}</span>
          <Select value={direction ?? "both"} onValueChange={(v) => setDirection(v as TopologyParams["direction"])}>
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
              <SelectItem value="downstream" data-testid="topology-direction-downstream">
                {t("topology.directionDownstream")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

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

      {!loading && !error && !unavailable && hasEdges && (
        <div
          data-testid="topology-graph"
          className={cn(
            "rounded-lg border border-border bg-card",
            compact ? "h-64" : "h-96",
          )}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
        </div>
      )}
    </div>
  );
}
