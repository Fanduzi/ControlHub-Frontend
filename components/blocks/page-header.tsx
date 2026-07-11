import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
