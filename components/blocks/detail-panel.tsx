import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DetailPanelProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function DetailPanel({
  title,
  description,
  children,
  className,
}: DetailPanelProps) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
