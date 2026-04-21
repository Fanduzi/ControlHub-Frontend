import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DetailPanelProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function DetailPanel({
  title,
  description,
  actions,
  children,
  className,
}: DetailPanelProps) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="flex items-start justify-between border-b border-border px-4 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="ml-2 shrink-0">{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
