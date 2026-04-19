import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

type DataTableShellProps = {
  title: string;
  description: string;
  controls?: ReactNode;
  pagination?: ReactNode;
  loading?: boolean;
  children: ReactNode;
};

export function DataTableShell({
  title,
  description,
  controls,
  pagination,
  loading,
  children,
}: DataTableShellProps) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
      </div>
      <div>
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 w-[60px]" />
              </div>
            ))}
          </div>
        ) : (
          children
        )}
      </div>
      {pagination ? (
        <div className="border-t border-border px-4 py-3">{pagination}</div>
      ) : null}
    </section>
  );
}
