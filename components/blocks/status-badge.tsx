import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
  tone?: "health" | "lifecycle" | "neutral";
  className?: string;
};

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  health:
    "border-transparent bg-primary/10 text-primary data-[status=healthy]:bg-emerald-500/10 data-[status=healthy]:text-emerald-700 dark:data-[status=healthy]:text-emerald-300 data-[status=warning]:bg-amber-500/10 data-[status=warning]:text-amber-700 dark:data-[status=warning]:text-amber-300 data-[status=critical]:bg-rose-500/10 data-[status=critical]:text-rose-700 dark:data-[status=critical]:text-rose-300",
  lifecycle:
    "border-transparent bg-muted text-muted-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary data-[status=provisioning]:bg-amber-500/10 data-[status=provisioning]:text-amber-700 dark:data-[status=provisioning]:text-amber-300 data-[status=retired]:bg-muted data-[status=retired]:text-muted-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  tone = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      data-status={status}
      variant="outline"
      className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", toneClasses[tone], className)}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
