import Link from "next/link";

import { consoleNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SidebarProps = {
  pathname: string;
};

export function Sidebar({ pathname }: SidebarProps) {
  return (
    <aside className="flex h-full flex-col border-r border-border bg-[var(--sidebar)]">
      <div className="border-b border-sidebar-border px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
          ControlHub
        </p>
        <h2 className="mt-2 text-base font-semibold text-sidebar-foreground">
          Unified Resource Console
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform asset context, ownership, and auditability.
        </p>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {consoleNavigation.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.title}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    active
                      ? "border-sidebar-primary/20 bg-sidebar-primary/10 text-sidebar-foreground"
                      : "border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="mt-0.5 size-4 text-sky-700" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4 text-xs text-muted-foreground">
        Baseline phase: manual registration, relations, and audit feeds.
      </div>
    </aside>
  );
}
