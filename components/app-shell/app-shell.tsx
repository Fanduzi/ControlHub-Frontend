"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { useSidebarState } from "@/components/app-shell/use-sidebar-state";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { collapsed, toggle, hydrated } = useSidebarState();

  return (
    <div className="grid min-h-screen bg-muted/35 lg:grid-cols-[var(--sidebar-width)_1fr]" style={{
      "--sidebar-width": collapsed ? "56px" : "300px",
    } as React.CSSProperties}>
      <div className="hidden lg:block">
        <Sidebar
          pathname={pathname}
          collapsed={hydrated ? collapsed : false}
          onToggleCollapse={toggle}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <Topbar pathname={pathname} />
        <main className="min-w-0 flex-1 px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
