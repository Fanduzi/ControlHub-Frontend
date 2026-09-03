"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/blocks/status-badge";
import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { cn } from "@/lib/utils";
import type { TopologyNodeData } from "@/lib/topology-mapper";

type TopologyNodePopupProps = {
  data: TopologyNodeData;
  position: { x: number; y: number };
  onClose: () => void;
  onNavigate: (path: string) => void;
  getRoleLabel: (role: string) => string | null;
  getTypeLabel: (resourceType: string) => string;
};

export function TopologyNodePopup({
  data,
  position,
  onClose,
  onNavigate,
  getRoleLabel,
  getTypeLabel,
}: TopologyNodePopupProps) {
  const t = useTranslations();
  const isDb = data.resourceType === "database_instance" ||
    data.resourceType === "database_cluster" ||
    data.resourceType === "database_proxy";
  const addressParts: string[] = [];
  if (data.ip) addressParts.push(data.ip);
  if (data.port) addressParts.push(String(data.port));
  const address = addressParts.join(":");

  const roleLabel = getRoleLabel(data.topologyRole);
  const datacenter = data.labels?.datacenter || data.labels?.dc;
  const zone = data.labels?.zone || data.labels?.az;

  const POPUP_WIDTH = 300;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let px = position.x;
  let py = position.y;
  if (px + POPUP_WIDTH > vw - 16) px = position.x - POPUP_WIDTH - 56;
  if (py + 400 > vh - 16) py = Math.max(16, vh - 420);
  px = Math.max(16, px);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="presentation"
      data-testid="topology-node-popup-overlay"
    >
      <div
        className="absolute rounded-xl border border-border bg-card shadow-lg p-4 min-w-[280px] max-w-[340px]"
        style={{ left: px, top: py }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${data.displayName || data.name} details`}
        data-testid="topology-node-popup"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {isDb && data.resourceSubtype && <DbTypeIcon subtype={data.resourceSubtype} className="size-4 shrink-0" />}
            <span className="font-medium text-sm text-foreground truncate">{data.displayName || data.name}</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0 focus-visible:outline-2 focus-visible:outline-ring/50"
            data-testid="topology-node-popup-close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("common.fields.resourceType")}</span>
            <span className="text-foreground">{getTypeLabel(data.resourceType)}</span>
          </div>
          {data.resourceSubtype && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common.fields.engine")}</span>
              <div className="flex items-center gap-1">
                {isDb && <DbTypeIcon subtype={data.resourceSubtype} className="size-3" />}
                <span className="text-foreground capitalize">{data.resourceSubtype}</span>
              </div>
            </div>
          )}
          {data.hostname && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common.fields.hostname")}</span>
              <span className="font-mono text-foreground">{data.hostname}</span>
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
              <StatusBadge status={data.healthStatus} tone="health" className="text-[10px]" />
              <StatusBadge status={data.lifecycleStatus} tone="lifecycle" className="text-[10px]" />
            </div>
          </div>
          {roleLabel && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("topology.roles.generic")}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{roleLabel}</span>
            </div>
          )}
          {data.problems && data.problems.length > 0 && (
            <div className="flex justify-between items-start">
              <span className="text-muted-foreground">{t("topology.problemsTitle")}</span>
              <div className="flex flex-col gap-0.5 items-end">
                {data.problems.map((p, i) => (
                  <span key={i} className={cn("text-[10px] font-medium", p.severity === "critical" ? "text-red-500" : "text-amber-500")}>
                    {t.has(`topology.problemCodes.${p.code}`)
                      ? t(`topology.problemCodes.${p.code}`)
                      : t("topology.problemUnknown")}
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
              onClose();
              onNavigate(`/resources/${data.id}`);
            }}
          >
            <ExternalLink className="size-3" />
            {t("topology.viewDetails")}
          </Button>
        </div>
      </div>
    </div>
  );
}
