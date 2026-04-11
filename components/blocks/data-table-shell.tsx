import type { ReactNode } from "react";

type DataTableShellProps = {
  title: string;
  description: string;
  controls?: ReactNode;
  children: ReactNode;
};

export function DataTableShell({
  title,
  description,
  controls,
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
      <div>{children}</div>
    </section>
  );
}
