import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ResourceLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export function ResourceLink({
  href,
  children,
  className,
  onClick,
}: ResourceLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        "font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring/50 transition-colors",
        className,
      )}
    >
      {children}
    </a>
  );
}
