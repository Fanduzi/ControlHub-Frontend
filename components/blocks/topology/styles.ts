import type { TopologyNodeData } from "@/lib/topology-mapper";

export const ROLE_BORDER: Record<string, string> = {
  primary: "border-blue-500/50 dark:border-blue-400/50",
  replica: "border-cyan-500/50 dark:border-cyan-400/50",
  replica_intermediate: "border-teal-500/50 dark:border-teal-400/50",
  cluster: "border-violet-500/50 dark:border-violet-400/50",
  application: "border-indigo-500/50 dark:border-indigo-400/50",
  entry: "border-orange-500/50 dark:border-orange-400/50",
  proxy_active: "border-green-500/50 dark:border-green-400/50",
  proxy_standby: "border-yellow-500/50 dark:border-yellow-400/50",
  host: "border-slate-500/50 dark:border-slate-400/50",
  control_plane: "border-purple-500/50 dark:border-purple-400/50",
  service: "border-emerald-500/50 dark:border-emerald-400/50",
};

export const ROLE_BG: Record<string, string> = {
  primary: "bg-blue-500/5 dark:bg-blue-400/10",
  replica: "bg-cyan-500/5 dark:bg-cyan-400/10",
  replica_intermediate: "bg-teal-500/5 dark:bg-teal-400/10",
  cluster: "bg-violet-500/5 dark:bg-violet-400/10",
  application: "bg-indigo-500/5 dark:bg-indigo-400/10",
  entry: "bg-orange-500/5 dark:bg-orange-400/10",
  proxy_active: "bg-green-500/5 dark:bg-green-400/10",
  proxy_standby: "bg-yellow-500/5 dark:bg-yellow-400/10",
  host: "bg-slate-500/5 dark:bg-slate-400/10",
  control_plane: "bg-purple-500/5 dark:bg-purple-400/10",
  service: "bg-emerald-500/5 dark:bg-emerald-400/10",
};

export const STATUS_STYLES: Record<string, { border: string; bg: string }> = {
  critical: { border: "border-red-500/70 dark:border-red-400/70", bg: "bg-red-500/10 dark:bg-red-400/10" },
  warning: { border: "border-amber-500/70 dark:border-amber-400/70", bg: "bg-amber-500/10 dark:bg-amber-400/10" },
};

export function getNodeStatusStyle(data: TopologyNodeData) {
  const hasCritical = data.problems?.some((p) => p.severity === "critical");
  const hasWarning = data.problems?.some((p) => p.severity === "warning");
  if (hasCritical) return STATUS_STYLES.critical;
  if (hasWarning) return STATUS_STYLES.warning;
  return null;
}

export const ZONE_PALETTE = [
  { border: "border-blue-400/60 dark:border-blue-300/50", bg: "bg-blue-400/5 dark:bg-blue-300/10", label: "text-blue-500 dark:text-blue-300" },
  { border: "border-emerald-400/60 dark:border-emerald-300/50", bg: "bg-emerald-400/5 dark:bg-emerald-300/10", label: "text-emerald-500 dark:text-emerald-300" },
  { border: "border-amber-400/60 dark:border-amber-300/50", bg: "bg-amber-400/5 dark:bg-amber-300/10", label: "text-amber-500 dark:text-amber-300" },
  { border: "border-violet-400/60 dark:border-violet-300/50", bg: "bg-violet-400/5 dark:bg-violet-300/10", label: "text-violet-500 dark:text-violet-300" },
  { border: "border-rose-400/60 dark:border-rose-300/50", bg: "bg-rose-400/5 dark:bg-rose-300/10", label: "text-rose-500 dark:text-rose-300" },
  { border: "border-cyan-400/60 dark:border-cyan-300/50", bg: "bg-cyan-400/5 dark:bg-cyan-300/10", label: "text-cyan-500 dark:text-cyan-300" },
];

export function getZoneColor(zoneKey: string) {
  let hash = 0;
  for (let i = 0; i < zoneKey.length; i++) hash = zoneKey.charCodeAt(i) + ((hash << 5) - hash);
  return ZONE_PALETTE[Math.abs(hash) % ZONE_PALETTE.length];
}
