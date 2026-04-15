"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PanelLeftClose, PanelLeft } from "lucide-react";

import { useEnvironment } from "@/components/providers/environment-provider";
import { consoleNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

type SidebarProps = {
  pathname: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function Sidebar({ pathname, collapsed = false, onToggleCollapse }: SidebarProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const { currentEnvironmentId } = useEnvironment();
  const environmentId = searchParams.get("environmentId") ?? currentEnvironmentId;

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-[var(--sidebar)] transition-[width] duration-200",
        collapsed ? "w-14" : "w-[300px]",
      )}
    >
      <div className={cn("border-b border-sidebar-border px-4 py-4", collapsed && "px-2")}>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {collapsed ? "CH" : t("common.brand")}
        </p>
        {!collapsed && (
          <>
            <h2 className="mt-2 text-base font-semibold text-sidebar-foreground">
              {t("shell.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("shell.description")}
            </p>
          </>
        )}
      </div>

      <nav className={cn("flex-1 px-3 py-4", collapsed && "px-1")}>
        <ul className="flex flex-col gap-1">
          {consoleNavigation.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const title = t(`navigation.${item.id}.title`);
            const description = t(`navigation.${item.id}.description`);

            const href = environmentId && item.supportsEnvironment
              ? `${item.href}?environmentId=${environmentId}`
              : item.href;

            const linkContent = collapsed ? (
              <Link
                href={href}
                aria-label={title}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-center rounded-md border p-2 transition-colors",
                  active
                    ? "border-sidebar-primary/20 bg-sidebar-primary/10 text-sidebar-foreground"
                    : "border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-4 text-primary" />
              </Link>
            ) : (
              <Link
                href={href}
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
                    {description}
                  </span>
                </span>
              </Link>
            );

            return (
              <li key={item.href}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {title}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {description}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  linkContent
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("border-t border-sidebar-border px-4 py-3", collapsed && "px-2")}>
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            aria-label={collapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
            className={cn("w-full justify-center", !collapsed && "justify-start")}
          >
            {collapsed ? (
              <PanelLeft className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("shell.collapseSidebar")}
                </span>
              </>
            )}
          </Button>
        )}
      </div>
    </aside>
  );
}
