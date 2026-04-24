import type { TopologyNodeData } from "@/lib/topology-mapper";

export const ROLE_BORDER: Record<string, string> = {
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

export const ROLE_BG: Record<string, string> = {
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

export const STATUS_STYLES: Record<string, { border: string; bg: string }> = {
  critical: { border: "border-red-500/70", bg: "bg-red-500/10" },
  warning: { border: "border-amber-500/70", bg: "bg-amber-500/10" },
};

export function getNodeStatusStyle(data: TopologyNodeData) {
  const hasCritical = data.problems?.some((p) => p.severity === "critical");
  const hasWarning = data.problems?.some((p) => p.severity === "warning");
  if (hasCritical) return STATUS_STYLES.critical;
  if (hasWarning) return STATUS_STYLES.warning;
  return null;
}

export const ZONE_PALETTE = [
  { border: "border-blue-400/60", bg: "bg-blue-400/5", label: "text-blue-500" },
  { border: "border-emerald-400/60", bg: "bg-emerald-400/5", label: "text-emerald-500" },
  { border: "border-amber-400/60", bg: "bg-amber-400/5", label: "text-amber-500" },
  { border: "border-violet-400/60", bg: "bg-violet-400/5", label: "text-violet-500" },
  { border: "border-rose-400/60", bg: "bg-rose-400/5", label: "text-rose-500" },
  { border: "border-cyan-400/60", bg: "bg-cyan-400/5", label: "text-cyan-500" },
];

export function getZoneColor(zoneKey: string) {
  let hash = 0;
  for (let i = 0; i < zoneKey.length; i++) hash = zoneKey.charCodeAt(i) + ((hash << 5) - hash);
  return ZONE_PALETTE[Math.abs(hash) % ZONE_PALETTE.length];
}
