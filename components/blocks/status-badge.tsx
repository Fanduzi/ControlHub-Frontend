import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
  tone?: "health" | "lifecycle" | "neutral";
  className?: string;
};

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  health:
    "border-transparent bg-sky-500/10 text-sky-700 data-[status=healthy]:bg-emerald-500/10 data-[status=healthy]:text-emerald-700 data-[status=warning]:bg-amber-500/10 data-[status=warning]:text-amber-700 data-[status=critical]:bg-rose-500/10 data-[status=critical]:text-rose-700",
  lifecycle:
    "border-transparent bg-slate-200 text-slate-700 data-[status=active]:bg-sky-500/10 data-[status=active]:text-sky-700 data-[status=provisioning]:bg-amber-500/10 data-[status=provisioning]:text-amber-700 data-[status=retired]:bg-zinc-200 data-[status=retired]:text-zinc-600",
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
