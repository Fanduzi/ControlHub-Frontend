"use client";

import { useCallback, useState, type ReactNode } from "react";

import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { useSidebarState } from "@/components/app-shell/use-sidebar-state";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { collapsed, toggle, hydrated } = useSidebarState();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleMobileMenuClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

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
        <Topbar pathname={pathname} onMobileMenuOpen={() => setMobileMenuOpen(true)} />
        <main className="min-w-0 flex-1 px-3 py-3 sm:px-5 sm:py-5">{children}</main>
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[300px] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            pathname={pathname}
            collapsed={false}
            onNavigate={handleMobileMenuClose}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
