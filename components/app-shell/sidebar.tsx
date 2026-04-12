import Link from "next/link";
import { useTranslations } from "next-intl";

import { consoleNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SidebarProps = {
  pathname: string;
};

export function Sidebar({ pathname }: SidebarProps) {
  const t = useTranslations();

  return (
    <aside className="flex h-full flex-col border-r border-border bg-[var(--sidebar)]">
      <div className="border-b border-sidebar-border px-4 py-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {t("common.brand")}
        </p>
        <h2 className="mt-2 text-base font-semibold text-sidebar-foreground">
          {t("shell.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("shell.description")}
        </p>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {consoleNavigation.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const title = t(`navigation.${item.id}.title`);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={title}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
                    active
                      ? "border-sidebar-primary/20 bg-sidebar-primary/10 text-sidebar-foreground"
                      : "border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="mt-0.5 size-4 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {t(`navigation.${item.id}.description`)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4 text-xs text-muted-foreground">
        {t("shell.baseline")}
      </div>
    </aside>
  );
}
