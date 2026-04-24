"use client";

import { useTranslations } from "next-intl";
import { Handle, Position } from "@xyflow/react";

import { StatusBadge } from "@/components/blocks/status-badge";
import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { cn } from "@/lib/utils";
import type { TopologyNodeData, GroupBoxData } from "@/lib/topology-mapper";
import { ROLE_BORDER, ROLE_BG, getNodeStatusStyle, getZoneColor } from "./styles";

export function TopologyNodeComponent({ data }: { data: TopologyNodeData }) {
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

      {address && (
        <div className="mt-0.5 text-[11px] font-mono text-foreground/80">
          {address}
        </div>
      )}

      {data.hostname && data.hostname !== data.ip && (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {data.hostname}
        </div>
      )}

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

      <div className="mt-1 flex gap-1">
        <StatusBadge status={data.healthStatus} tone="health" className="text-[10px]" />
        <StatusBadge status={data.lifecycleStatus} tone="lifecycle" className="text-[10px]" />
      </div>
    </div>
  );
}

export function TopologyGroupComponent({ data }: { data: GroupBoxData }) {
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

export const NODE_TYPES = {
  topologyNode: TopologyNodeComponent,
  topologyGroup: TopologyGroupComponent,
};
