"use client";

import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="grid min-h-screen bg-muted/30 lg:grid-cols-[300px_1fr]">
      <div className="hidden lg:block">
        <Sidebar pathname={pathname} />
      </div>
      <div className="flex min-w-0 flex-col">
        <Topbar pathname={pathname} />
        <main className="min-w-0 flex-1 px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
