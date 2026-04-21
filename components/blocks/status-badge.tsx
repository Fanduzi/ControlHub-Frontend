"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
  tone?: "health" | "lifecycle" | "neutral";
  className?: string;
};

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  health:
    "border-transparent bg-muted text-muted-foreground data-[status=healthy]:bg-emerald-500/10 data-[status=healthy]:text-emerald-700 dark:data-[status=healthy]:text-emerald-300 data-[status=warning]:bg-amber-500/10 data-[status=warning]:text-amber-700 dark:data-[status=warning]:text-amber-300 data-[status=critical]:bg-rose-500/10 data-[status=critical]:text-rose-700 dark:data-[status=critical]:text-rose-300 data-[status=degraded]:bg-orange-500/10 data-[status=degraded]:text-orange-700 dark:data-[status=degraded]:text-orange-300",
  lifecycle:
    "border-transparent bg-muted text-muted-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary data-[status=provisioning]:bg-amber-500/10 data-[status=provisioning]:text-amber-700 dark:data-[status=provisioning]:text-amber-300 data-[status=retired]:bg-muted data-[status=retired]:text-muted-foreground data-[status=stopped]:bg-muted data-[status=stopped]:text-muted-foreground data-[status=decommissioning]:bg-muted/50 data-[status=decommissioning]:text-muted-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  tone = "neutral",
  className,
}: StatusBadgeProps) {
  const t = useTranslations("statusValues");

  return (
    <Badge
      data-status={status}
      variant="outline"
      className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", toneClasses[tone], className)}
    >
      {t.has(status) ? t(status) : status.replaceAll("_", " ")}
    </Badge>
  );
}
