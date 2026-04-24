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

import { AlertTriangle, ChevronDown, ExternalLink, X } from "lucide-react";
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
import type { TopologyParams, TopologyResponse, TopologyProblemSummary } from "@/types/resource";

// --- Role-based node styling ---
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

// --- Status-based node coloring (Orchestrator-style) ---
const STATUS_STYLES: Record<string, { border: string; bg: string }> = {
  critical: { border: "border-red-500/70", bg: "bg-red-500/10" },
  warning: { border: "border-amber-500/70", bg: "bg-amber-500/10" },
};

function getNodeStatusStyle(data: TopologyNodeData) {
  const hasCritical = data.problems?.some((p) => p.severity === "critical");
  const hasWarning = data.problems?.some((p) => p.severity === "warning");
  if (hasCritical) return STATUS_STYLES.critical;
  if (hasWarning) return STATUS_STYLES.warning;
  return null;
}

// --- Zone color palette for group boxes ---
const ZONE_PALETTE = [
  { border: "border-blue-400/60", bg: "bg-blue-400/5", label: "text-blue-500" },
  { border: "border-emerald-400/60", bg: "bg-emerald-400/5", label: "text-emerald-500" },
  { border: "border-amber-400/60", bg: "bg-amber-400/5", label: "text-amber-500" },
  { border: "border-violet-400/60", bg: "bg-violet-400/5", label: "text-violet-500" },
  { border: "border-rose-400/60", bg: "bg-rose-400/5", label: "text-rose-500" },
  { border: "border-cyan-400/60", bg: "bg-cyan-400/5", label: "text-cyan-500" },
];

function getZoneColor(zoneKey: string) {
  let hash = 0;
  for (let i = 0; i < zoneKey.length; i++) hash = zoneKey.charCodeAt(i) + ((hash << 5) - hash);
  return ZONE_PALETTE[Math.abs(hash) % ZONE_PALETTE.length];
}

type TopologyPanelProps = {
  resourceId: number;
  className?: string;
  compact?: boolean;
  urlSync?: boolean;
};

// --- Standalone node components (stable references for ReactFlow nodeTypes) ---

function TopologyNodeComponent({ data }: { data: TopologyNodeData }) {
  const t = useTranslations();
  const getRoleLabel = (role: string): string | null => {
    const key = `topology.roles.${role}`;
    return t.has(key) ? t(key) : null;
  };
  const getTypeLabel = (resourceType: string): string => {
    const key = `topology.types.${resourceType}`;
    return t.has(key) ? t(key) : resourceType.replace(/_/g, " ");
  };
  const roleLabel = getRoleLabel(data.topologyRole);
  const roleBorder = ROLE_BORDER[data.topologyRole] ?? "border-border";
  const roleBg = ROLE_BG[data.topologyRole] ?? "bg-card";
  const statusStyle = getNodeStatusStyle(data);
  const handleClass = "!w-2 !h-2 !bg-muted-foreground/40 !border-0";

  const addressParts: string[] = [];
  if (data.ip) addressParts.push(data.ip);
  if (data.port) addressParts.push(String(data.port));
  const address = addressParts.join(":");
  const isDb = data.resourceType === "database_instance" ||
    data.resourceType === "database_cluster" ||
    data.resourceType === "database_proxy";
  const isDatabase = data.isDatabaseTopology ?? false;

  return (
    <div
      data-testid={`topology-node-${data.id}`}
      data-is-root={data.isRoot ? "true" : "false"}
      data-topology-role={data.topologyRole}
      tabIndex={0}
      role="button"
      aria-label={`${data.displayName || data.name}, ${data.healthStatus ?? "unknown"}`}
      className={cn(
        "relative rounded-lg border px-3 py-2 text-xs shadow-sm transition-colors min-w-[140px] max-w-[220px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1",
        data.isRoot
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
          : statusStyle
            ? cn(statusStyle.border, statusStyle.bg)
            : cn(roleBorder, roleBg),
      )}
    >
      <Handle type="source" position={Position.Left} id="source-left" className={handleClass} />
      <Handle type="target" position={Position.Left} id="target-left" className={handleClass} />
      <Handle type="source" position={Position.Top} id="source-top" className={handleClass} />
      <Handle type="target" position={Position.Top} id="target-top" className={handleClass} />
      <Handle type="source" position={Position.Right} id="source-right" className={handleClass} />
      <Handle type="target" position={Position.Right} id="target-right" className={handleClass} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className={handleClass} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className={handleClass} />

      {/* Line 1: Icon + Name + Role */}
      <div className="flex items-center gap-1.5">
        {isDb && data.resourceSubtype && (
          <DbTypeIcon subtype={data.resourceSubtype} className="size-3.5 shrink-0" />
        )}
        <span className="font-medium text-foreground truncate">
          {data.displayName || data.name}
        </span>
        {data.isRoot && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary shrink-0">
            {t("topology.rootLabel")}
          </span>
        )}
        {roleLabel && !data.isRoot && isDatabase && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
            {roleLabel}
          </span>
        )}
      </div>

      {/* Line 2: IP:port (for DB instances and hosts) */}
      {address && (
        <div className="mt-0.5 text-[11px] font-mono text-foreground/80">
          {address}
        </div>
      )}

      {/* Line 3: Hostname (if different from IP) */}
      {data.hostname && data.hostname !== data.ip && (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {data.hostname}
        </div>
      )}

      {/* Fallback: show type if no IP */}
      {!address && (
        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <span>{getTypeLabel(data.resourceType)}</span>
          {data.resourceSubtype && !isDb && (
            <>
              <span>·</span>
              <span>{data.resourceSubtype}</span>
            </>
          )}
        </div>
      )}

      {/* Line 4: Status badges */}
      <div className="mt-1 flex gap-1">
        <StatusBadge status={data.healthStatus} tone="health" className="text-[10px]" />
        <StatusBadge status={data.lifecycleStatus} tone="lifecycle" className="text-[10px]" />
      </div>
    </div>
  );
}

function TopologyGroupComponent({ data }: { data: GroupBoxData }) {
  const handleClass = "!w-2 !h-2 !bg-muted-foreground/30 !border-0";
  const zoneColor = getZoneColor(data.label || "default");

  return (
    <div
      className={cn("relative h-full w-full rounded-lg border-2 border-dashed", zoneColor.border, zoneColor.bg)}
      aria-label={data.label ? `Zone: ${data.label}` : "Zone group"}
    >
      <Handle type="source" position={Position.Left} id="source-left" className={handleClass} />
      <Handle type="target" position={Position.Left} id="target-left" className={handleClass} />
      <Handle type="source" position={Position.Top} id="source-top" className={handleClass} />
      <Handle type="target" position={Position.Top} id="target-top" className={handleClass} />
      <Handle type="source" position={Position.Right} id="source-right" className={handleClass} />
      <Handle type="target" position={Position.Right} id="target-right" className={handleClass} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className={handleClass} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className={handleClass} />
      <div className={cn("absolute -top-3 left-3 rounded bg-background px-2 py-0.5 text-[10px] font-medium", zoneColor.label)}>
        {data.label}
      </div>
    </div>
  );
}

// Stable nodeTypes reference — components are defined above as top-level functions.
const NODE_TYPES = {
  topologyNode: TopologyNodeComponent,
  topologyGroup: TopologyGroupComponent,
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

  // Localized type labels
  const getTypeLabel = useCallback(
    (resourceType: string): string => {
      const key = `topology.types.${resourceType}`;
      return t.has(key) ? t(key) : resourceType.replace(/_/g, " ");
    },
    [t],
  );

  // Localized role label
  const getRoleLabel = useCallback(
    (role: string): string | null => {
      const key = `topology.roles.${role}`;
      return t.has(key) ? t(key) : null;
    },
    [t],
  );

  // Localized edge type label
  const getEdgeTypeLabel = useCallback(
    (semanticType: string | undefined): string | null => {
      if (!semanticType) return null;
      const key = `topology.edgeTypes.${semanticType}`;
      return t.has(key) ? t(key) : null;
    },
    [t],
  );

  // Highlight a node in the graph (used by problem panel)
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

  // nodeTypes is a stable module-level constant (NODE_TYPES).
  // Defined outside TopologyPanelInner so ReactFlow never remounts nodes.
  const nodeTypes = NODE_TYPES;

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

  // --- Problem summary panel ---
  const renderProblemsPanel = () => {
    const problems = topology?.problems;
    if (!problems || problems.length === 0) return null;

    return (
      <div className="rounded-lg border border-border bg-card">
        <button
          onClick={() => setProblemsExpanded(!problemsExpanded)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs"
          data-testid="topology-problems-toggle"
        >
          <span className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="size-3.5 text-amber-500" />
            {t("topology.problemsTitle")} ({problems.length})
          </span>
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", problemsExpanded && "rotate-180")} />
        </button>
        {problemsExpanded && (
          <div className="border-t border-border px-3 py-2 space-y-1">
            {problems.map((p: TopologyProblemSummary) => (
              <div
                key={p.resourceId}
                className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-muted/50 rounded px-2"
                onClick={() => highlightNode(p.resourceId)}
                data-testid={`topology-problem-${p.resourceId}`}
              >
                <span className={cn("size-2 rounded-full shrink-0", p.severity === "critical" ? "bg-red-500" : "bg-amber-500")} aria-label={p.severity === "critical" ? t("topology.severityCritical") : t("topology.severityWarning")} role="img" />
                <span className="font-medium text-foreground">{p.resourceName}</span>
                <span className="text-muted-foreground truncate">
                  {p.problems.map((pr) => {
                    const key = `topology.problem${pr.code.charAt(0).toUpperCase()}${pr.code.slice(1)}`;
                    return t.has(key) ? t(key) : pr.message;
                  }).join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // --- Node detail popup (anchored to clicked node) ---
  const renderNodePopup = () => {
    if (!selectedNodePopup) return null;
    const d = selectedNodePopup.data;
    const isDb = d.resourceType === "database_instance" ||
      d.resourceType === "database_cluster" ||
      d.resourceType === "database_proxy";
    const addressParts: string[] = [];
    if (d.ip) addressParts.push(d.ip);
    if (d.port) addressParts.push(String(d.port));
    const address = addressParts.join(":");

    const roleLabel = getRoleLabel(d.topologyRole);
    const datacenter = d.labels?.datacenter || d.labels?.dc;
    const zone = d.labels?.zone || d.labels?.az;

    // Position: anchor to the right of the node, flip left if overflows
    const POPUP_WIDTH = 300;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    let px = selectedNodePopup.position.x;
    let py = selectedNodePopup.position.y;
    if (px + POPUP_WIDTH > vw - 16) px = selectedNodePopup.position.x - POPUP_WIDTH - 56;
    if (py + 400 > vh - 16) py = Math.max(16, vh - 420);
    px = Math.max(16, px);

    return (
      <div
        className="fixed inset-0 z-50"
        onClick={() => setSelectedNodePopup(null)}
        onKeyDown={(e) => { if (e.key === "Escape") setSelectedNodePopup(null); }}
        role="presentation"
        data-testid="topology-node-popup-overlay"
      >
        <div
          className="absolute rounded-xl border border-border bg-card shadow-lg p-4 min-w-[280px] max-w-[340px]"
          style={{ left: px, top: py }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`${d.displayName || d.name} details`}
          data-testid="topology-node-popup"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              {isDb && d.resourceSubtype && <DbTypeIcon subtype={d.resourceSubtype} className="size-4 shrink-0" />}
              <span className="font-medium text-sm text-foreground truncate">{d.displayName || d.name}</span>
            </div>
            <button
              onClick={() => setSelectedNodePopup(null)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              data-testid="topology-node-popup-close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common.fields.resourceType")}</span>
              <span className="text-foreground">{getTypeLabel(d.resourceType)}</span>
            </div>
            {d.resourceSubtype && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.fields.engine")}</span>
                <div className="flex items-center gap-1">
                  {isDb && <DbTypeIcon subtype={d.resourceSubtype} className="size-3" />}
                  <span className="text-foreground capitalize">{d.resourceSubtype}</span>
                </div>
              </div>
            )}
            {d.hostname && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.fields.hostname")}</span>
                <span className="font-mono text-foreground">{d.hostname}</span>
              </div>
            )}
            {address && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("topology.address")}</span>
                <span className="font-mono text-foreground">{address}</span>
              </div>
            )}
            {datacenter && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("topology.datacenter")}</span>
                <span className="text-foreground">{datacenter}</span>
              </div>
            )}
            {zone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("topology.zone")}</span>
                <span className="text-foreground">{zone}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("common.fields.status")}</span>
              <div className="flex gap-1">
                <StatusBadge status={d.healthStatus} tone="health" className="text-[10px]" />
                <StatusBadge status={d.lifecycleStatus} tone="lifecycle" className="text-[10px]" />
              </div>
            </div>
            {roleLabel && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("topology.roles.generic")}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{roleLabel}</span>
              </div>
            )}
            {d.problems && d.problems.length > 0 && (
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">{t("topology.problemsTitle")}</span>
                <div className="flex flex-col gap-0.5 items-end">
                  {d.problems.map((p, i) => (
                    <span key={i} className={cn("text-[10px] font-medium", p.severity === "critical" ? "text-red-500" : "text-amber-500")}>
                      {p.message}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                setSelectedNodePopup(null);
                router.push(`/resources/${d.id}`);
              }}
            >
              <ExternalLink className="size-3" />
              {t("topology.viewDetails")}
            </Button>
          </div>
        </div>
      </div>
    );
  };

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

  // Render layer band labels
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
      {!expanded && renderControls()}

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

      {!loading && !error && !unavailable && topology && renderProblemsPanel()}

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
          <div className="px-4 pt-2">
            {renderProblemsPanel()}
          </div>
          <div className="flex-1">{renderGraph()}</div>
        </div>
      )}

      {/* Node detail popup */}
      {renderNodePopup()}
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
